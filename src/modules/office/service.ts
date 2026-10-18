import crypto from "node:crypto";
import { fail, ok } from "../../libs/response";
import { canManage } from "../../libs/workspaceRole";
import { Agent } from "../agents/schema";
import { Project } from "../projects/schema";
import { Task } from "../tasks/schema";
import { User } from "../users/model";
import { Workspace } from "../workspaces/model";
import { WorkspaceService } from "../workspaces/service";
import { OfficeConnection } from "./schema";
import type { OfficeUser } from "./types";

export const OFFICE_TOKEN_PREFIX = "kai_";
const PAIR_TTL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_S = 3;
const TOUCH_EVERY_MS = 5 * 60 * 1000;
// No 0/O/1/I so the code is easy to read out loud.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const sha256 = (s: string) =>
	crypto.createHash("sha256").update(s).digest("hex");
const randomToken = (bytes = 32) =>
	crypto.randomBytes(bytes).toString("base64url");

function pairCode() {
	const bytes = crypto.randomBytes(8);
	const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
	return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

const isLive = (expiresAt?: Date | null) =>
	!!expiresAt && expiresAt.getTime() > Date.now();

// ─── Office-token scope ──────────────────────────────────────────────────────
// An office token may only do what the AI office needs, inside ONE workspace:
// read agents/projects/tickets, move a ticket's status, and comment on it.

const TASK_ID = /^\/api\/tasks\/([0-9a-f]{24})$/i;
const TASK_STATUS = /^\/api\/tasks\/([0-9a-f]{24})\/status$/i;
const TASK_COMMENT = /^\/api\/tasks\/([0-9a-f]{24})\/comments$/i;
const PROJECT_ID = /^\/api\/projects\/([0-9a-f]{24})$/i;

async function inWorkspace(
	model: "task" | "project" | "agent",
	id: string,
	workspace: string,
) {
	const M = model === "task" ? Task : model === "project" ? Project : Agent;
	const doc = await (M as typeof Task)
		.findById(id, { workspace: 1 })
		.lean<{ workspace?: { toString(): string } }>();
	return doc?.workspace?.toString() === workspace;
}

export abstract class OfficeService {
	/** Office token → acting user, or null when unknown/revoked. */
	static async authenticate(token: string): Promise<OfficeUser | null> {
		if (!token.startsWith(OFFICE_TOKEN_PREFIX)) return null;
		const conn = await OfficeConnection.findOne({
			tokenHash: sha256(token),
			status: "active",
		}).lean();
		if (!conn?.user || !conn.workspace) return null;
		const last = conn.lastUsedAt?.getTime() ?? 0;
		if (Date.now() - last > TOUCH_EVERY_MS) {
			void OfficeConnection.updateOne(
				{ _id: conn._id },
				{ lastUsedAt: new Date() },
			).catch(() => {});
		}
		return {
			sub: conn.user.toString(),
			email: "office@kantor-ai",
			role: "office",
			officeId: conn._id.toString(),
			officeWorkspace: conn.workspace.toString(),
		};
	}

	/** Why this office request is not allowed, or null when it is. */
	static async scopeError(
		office: OfficeUser,
		method: string,
		pathname: string,
		query: Record<string, string | undefined>,
	): Promise<string | null> {
		const ws = office.officeWorkspace;
		const path = pathname.replace(/\/+$/, "") || "/";
		const denied = "This office connection is not allowed to do that";
		const otherWs = "This office connection is limited to another workspace";

		if (path === "/api/office/me" && (method === "GET" || method === "DELETE"))
			return null;

		if (method === "GET") {
			if (path === "/api/agents/export" || path === "/api/projects")
				return query.workspace === ws ? null : otherWs;
			if (path === "/api/tasks") {
				if (query.workspace) return query.workspace === ws ? null : otherWs;
				if (query.assignedAgent)
					return (await inWorkspace("agent", query.assignedAgent, ws))
						? null
						: otherWs;
				if (query.project)
					return (await inWorkspace("project", query.project, ws))
						? null
						: otherWs;
				return otherWs;
			}
			const p = path.match(PROJECT_ID);
			if (p) return (await inWorkspace("project", p[1], ws)) ? null : otherWs;
			const tk = path.match(TASK_ID);
			if (tk) return (await inWorkspace("task", tk[1], ws)) ? null : otherWs;
			return denied;
		}
		const st = method === "PATCH" && path.match(TASK_STATUS);
		const cm = method === "POST" && path.match(TASK_COMMENT);
		const id = (st || cm || [])[1];
		if (id) return (await inWorkspace("task", id, ws)) ? null : otherWs;
		return denied;
	}

	// ─── Pairing (called by the office, no login) ──────────────────────────────

	static async start(deviceName: string) {
		const deviceCode = randomToken();
		let code = pairCode();
		for (let i = 0; i < 5; i++) {
			const taken = await OfficeConnection.exists({
				pairCode: code,
				status: { $in: ["pending", "approved"] },
			});
			if (!taken) break;
			code = pairCode();
		}
		await OfficeConnection.create({
			deviceName,
			pairCode: code,
			deviceCodeHash: sha256(deviceCode),
			expiresAt: new Date(Date.now() + PAIR_TTL_MS),
		});
		return ok(
			{
				pairCode: code,
				deviceCode,
				expiresIn: PAIR_TTL_MS / 1000,
				interval: POLL_INTERVAL_S,
			},
			"Pairing started",
		);
	}

	/** The office polls this until the owner allowed (token, once) or denied. */
	static async poll(deviceCode: string) {
		const conn = await OfficeConnection.findOne({
			deviceCodeHash: sha256(deviceCode),
		});
		if (!conn) return fail(410, "Pairing expired. Start again.");
		if (conn.status === "denied")
			return ok({ status: "denied" as const }, "Pairing denied");
		if (
			(conn.status === "pending" || conn.status === "approved") &&
			!isLive(conn.expiresAt)
		)
			return fail(410, "Pairing expired. Start again.");
		if (conn.status === "pending")
			return ok({ status: "pending" as const }, "Waiting for approval");
		if (conn.status !== "approved")
			return fail(410, "This pairing was already used.");

		const token = `${OFFICE_TOKEN_PREFIX}${randomToken()}`;
		conn.tokenHash = sha256(token);
		conn.status = "active";
		conn.expiresAt = null;
		conn.lastUsedAt = new Date();
		await conn.save();
		const [ws, user] = await Promise.all([
			Workspace.findById(conn.workspace, { name: 1, type: 1 }).lean(),
			User.findById(conn.user, { name: 1, email: 1 }).lean(),
		]);
		return ok(
			{
				status: "active" as const,
				token,
				connectionId: conn.id as string,
				workspace: ws ? { _id: ws._id, name: ws.name, type: ws.type } : null,
				user: user ? { name: user.name, email: user.email } : null,
			},
			"Office connected",
		);
	}

	// ─── Approval (josh-vault, logged-in owner) ─────────────────────────────────

	private static async pendingByCode(code: string) {
		const conn = await OfficeConnection.findOne({
			pairCode: code,
			status: "pending",
		});
		return conn && isLive(conn.expiresAt) ? conn : null;
	}

	static async getPending(code: string) {
		const conn = await this.pendingByCode(code);
		if (!conn)
			return fail(
				404,
				"This code is unknown or expired. Start again in the office.",
			);
		return ok(
			{
				pairCode: conn.pairCode,
				deviceName: conn.deviceName,
				createdAt: (conn as unknown as { createdAt: Date }).createdAt,
				expiresAt: conn.expiresAt,
			},
			"Pairing request",
		);
	}

	static async approve(
		code: string,
		user: { sub: string; role?: string },
		workspace: string,
	) {
		if (user.role === "office" || user.role === "service")
			return fail(403, "Only a signed-in person can connect an office");
		const conn = await this.pendingByCode(code);
		if (!conn)
			return fail(
				404,
				"This code is unknown or expired. Start again in the office.",
			);
		const role = await WorkspaceService.membershipRole(workspace, user.sub);
		if (!canManage(role))
			return fail(403, "Only a workspace owner or admin can connect an office");

		conn.set({
			status: "approved",
			user: user.sub,
			workspace,
			approvedAt: new Date(),
			expiresAt: new Date(Date.now() + PAIR_TTL_MS),
		});
		await conn.save();
		return ok({ status: "approved" }, "Office allowed");
	}

	static async deny(code: string, user: { sub: string; role?: string }) {
		if (user.role === "office")
			return fail(403, "Only a signed-in person can do that");
		const conn = await this.pendingByCode(code);
		if (!conn) return fail(404, "This code is unknown or expired.");
		conn.status = "denied";
		await conn.save();
		return ok({ status: "denied" }, "Office denied");
	}

	// ─── Connected offices (josh-vault) ─────────────────────────────────────────

	static async list(userId: string, workspace?: string) {
		const filter: Record<string, unknown> = { user: userId, status: "active" };
		if (workspace) filter.workspace = workspace;
		const list = await OfficeConnection.find(filter, {
			deviceName: 1,
			workspace: 1,
			approvedAt: 1,
			lastUsedAt: 1,
			createdAt: 1,
		})
			.sort({ approvedAt: -1 })
			.populate("workspace", "name type")
			.lean();
		return ok(list, "Connected offices");
	}

	static async revoke(id: string, user: { sub: string; role?: string }) {
		if (user.role === "office")
			return fail(403, "Use DELETE /office/me to disconnect this office");
		const conn = await OfficeConnection.findOne({
			_id: id,
			user: user.sub,
			status: "active",
		});
		if (!conn) return fail(404, "Connection not found");
		conn.set({ status: "revoked", tokenHash: null, revokedAt: new Date() });
		await conn.save();
		return ok({ status: "revoked" }, "Office disconnected");
	}

	// ─── The office itself ──────────────────────────────────────────────────────

	static async me(office: OfficeUser) {
		const [conn, ws, user] = await Promise.all([
			OfficeConnection.findById(office.officeId, {
				deviceName: 1,
				approvedAt: 1,
			}).lean(),
			Workspace.findById(office.officeWorkspace, { name: 1, type: 1 }).lean(),
			User.findById(office.sub, { name: 1, email: 1 }).lean(),
		]);
		return ok(
			{
				connectionId: office.officeId,
				deviceName: conn?.deviceName ?? null,
				approvedAt: conn?.approvedAt ?? null,
				workspace: ws ? { _id: ws._id, name: ws.name, type: ws.type } : null,
				user: user ? { name: user.name, email: user.email } : null,
			},
			"Office connection",
		);
	}

	static async disconnectSelf(office: OfficeUser) {
		await OfficeConnection.updateOne(
			{ _id: office.officeId },
			{ status: "revoked", tokenHash: null, revokedAt: new Date() },
		);
		return ok({ status: "revoked" }, "Office disconnected");
	}
}
