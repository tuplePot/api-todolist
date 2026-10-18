import { Elysia } from "elysia";
import { guard } from "../../libs/guard";
import { fail } from "../../libs/response";
import { objectIdParam } from "../../libs/schema";
import {
	connectionQuery,
	pairApproveBody,
	pairCodeParam,
	pairStartBody,
	pairTokenBody,
} from "./model";
import { OfficeService } from "./service";
import type { OfficeUser } from "./types";

const isOffice = (user: { role?: string }): user is OfficeUser =>
	user.role === "office";

// Linking the AI office (Kantor AI desktop app) to an account, like a TV login:
// the office shows a code, the owner allows it in josh-vault, the office gets a
// workspace-limited token it can be disconnected from at any time.
export const officeModule = new Elysia({ prefix: "/office" })
	// ── Public: called by the office before it has a token ───────────────────
	.post("/pair/start", ({ body }) => OfficeService.start(body.deviceName), {
		body: pairStartBody,
	})
	.post("/pair/token", ({ body }) => OfficeService.poll(body.deviceCode), {
		body: pairTokenBody,
	})
	// ── Signed in ────────────────────────────────────────────────────────────
	.guard({}, (app) =>
		app
			.use(guard)
			.get(
				"/pair/:code",
				({ params: { code } }) => OfficeService.getPending(code),
				{ params: pairCodeParam },
			)
			.post(
				"/pair/:code/approve",
				({ user, params: { code }, body }) =>
					OfficeService.approve(code, user, body.workspace),
				{ params: pairCodeParam, body: pairApproveBody },
			)
			.post(
				"/pair/:code/deny",
				({ user, params: { code } }) => OfficeService.deny(code, user),
				{ params: pairCodeParam },
			)
			.get(
				"/connections",
				({ user, query }) => OfficeService.list(user.sub, query.workspace),
				{ query: connectionQuery },
			)
			.delete(
				"/connections/:id",
				({ user, params: { id } }) => OfficeService.revoke(id, user),
				{ params: objectIdParam },
			)
			// The office asking about / ending its own connection.
			.get("/me", ({ user }) =>
				isOffice(user)
					? OfficeService.me(user)
					: fail(400, "Only an office token can use this"),
			)
			.delete("/me", ({ user }) =>
				isOffice(user)
					? OfficeService.disconnectSelf(user)
					: fail(400, "Only an office token can use this"),
			),
	);
