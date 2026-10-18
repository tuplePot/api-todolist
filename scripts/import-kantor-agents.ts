/**
 * Import the AI office (Kantor AI) roster through the Memoria API.
 *
 * Reads `kantor/config.json` (employees[]) and each employee's
 * `kantor/karyawan/<id>/CLAUDE.md`, then calls the running API:
 *   - POST /api/agent-teams  one team per distinct `division`
 *   - POST /api/agents       one agent per employee (slug = employee id,
 *                            rolePrompt = CLAUDE.md, mission = "## Mission")
 *
 * Everything goes through the API, so its validation and owner/admin rules
 * apply. Idempotent: teams are matched by name, agents by slug (archived ones
 * included). Existing agents are skipped unless you pass `--update`.
 *
 * Needs the API running (`bun run dev`). Auth uses the service API key:
 * Bun loads this project's `.env`, so API_KEY / API_USER_ID are picked up.
 *
 * Env (all optional):
 *   IMPORT_API_URL  API base URL (default http://localhost:$PORT, PORT=5000)
 *   WORKSPACE_ID    Target workspace (default: your personal workspace)
 *   KANTOR_DIR      The office's `kantor` folder
 *                   (default D:\code-4\virtual-ai-agent\ai-office-tauri\kantor)
 *
 * Run:
 *   bun run import:agents --workspaces   # list your workspaces and exit
 *   bun run import:agents --dry          # show the plan, write nothing
 *   bun run import:agents                # create missing teams/agents
 *   bun run import:agents --update       # also overwrite existing agents
 */

import fs from "node:fs";
import path from "node:path";

interface KantorEmployee {
	id: string;
	name?: string;
	role?: string;
	division?: string;
	color?: string;
	vrm?: string | null;
	extraTools?: string[];
	extraFolders?: string[];
	projectAccess?: "none" | "read" | "edit";
	model?: string;
	effort?: string;
	mission?: string;
}

interface Envelope<T> {
	success: boolean;
	message: string;
	data: T;
	errors?: unknown;
}

type Doc = { _id: string; name: string };
type WorkspaceDoc = Doc & {
	type: "personal" | "team";
	members: { user: string; role: string }[];
};
type AgentDoc = Doc & { slug: string; isArchived: boolean };

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry");
const UPDATE = args.has("--update");
const LIST_WORKSPACES = args.has("--workspaces");

const API_URL = (
	process.env.IMPORT_API_URL ?? `http://localhost:${process.env.PORT ?? 5000}`
).replace(/\/+$/, "");
const API_KEY = process.env.API_KEY;
const ACTING_USER = process.env.API_USER_ID;
const KANTOR_DIR =
	process.env.KANTOR_DIR ??
	"D:\\code-4\\virtual-ai-agent\\ai-office-tauri\\kantor";

// Mirrors the API's own validation so bad rows are cleaned, not rejected.
const SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MCP_RE = /^mcp__[A-Za-z0-9_*-]+$/;
const MODEL_RE = /^[\w.\-[\]]+$/;
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const TEAM_COLORS = ["#ffb703", "#219ebc", "#80b918", "#c77dff", "#fb8500"];

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function api<T>(
	method: string,
	route: string,
	body?: unknown,
): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${API_URL}/api${route}`, {
			method,
			headers: {
				"Content-Type": "application/json",
				"x-api-key": API_KEY as string,
				...(ACTING_USER ? { "x-user-id": ACTING_USER } : {}),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch (err) {
		throw new Error(
			`Cannot reach the API at ${API_URL}. Is it running (bun run dev)?`,
			{ cause: err },
		);
	}
	const json = (await res.json().catch(() => null)) as Envelope<T> | null;
	if (!res.ok || !json?.success) {
		const detail = json?.errors ? ` ${JSON.stringify(json.errors)}` : "";
		throw new Error(
			`${method} ${route} → ${res.status} ${json?.message ?? res.statusText}${detail}`,
		);
	}
	return json.data;
}

// ─── Reading the office files ────────────────────────────────────────────────

const stripBom = (s: string) => s.replace(/^\uFEFF/, "");

const titleCase = (s: string) =>
	s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function readRolePrompt(id: string): string {
	const file = path.join(KANTOR_DIR, "karyawan", id, "CLAUDE.md");
	try {
		return stripBom(fs.readFileSync(file, "utf8")).slice(0, 20000);
	} catch {
		return "";
	}
}

/** First paragraph under "## Mission" in the role prompt, if any. */
function extractMission(md: string): string {
	const m = md.match(/^##\s*Mission\s*\n+([\s\S]*?)(?=\n\s*\n|\n##\s|$)/m);
	return (m?.[1] ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
}

function readEmployees(): KantorEmployee[] {
	const file = path.join(KANTOR_DIR, "config.json");
	const config = JSON.parse(stripBom(fs.readFileSync(file, "utf8"))) as {
		employees?: KantorEmployee[];
	};
	const all = config.employees ?? [];
	const valid = all.filter((e) =>
		SLUG_RE.test(String(e.id ?? "").toLowerCase()),
	);
	console.log(`Office roster: ${valid.length} employees in ${file}`);
	if (valid.length < all.length)
		console.warn(`  ! skipped ${all.length - valid.length} with an invalid id`);
	return valid;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function resolveWorkspace(): Promise<string> {
	const workspaces = await api<WorkspaceDoc[]>("GET", "/workspaces");
	const roleOf = (w: WorkspaceDoc) =>
		w.members.find((m) => String(m.user) === ACTING_USER)?.role ?? "?";

	if (LIST_WORKSPACES) {
		console.log("Your workspaces:");
		for (const w of workspaces)
			console.log(
				`  ${w._id}  ${w.type.padEnd(8)}  ${roleOf(w).padEnd(6)}  ${w.name}`,
			);
		process.exit(0);
	}

	const wanted = process.env.WORKSPACE_ID;
	const target = wanted
		? workspaces.find((w) => w._id === wanted)
		: workspaces.find((w) => w.type === "personal");
	if (!target)
		throw new Error(
			wanted
				? `Workspace ${wanted} not found for this user. Run with --workspaces.`
				: "No personal workspace found. Run with --workspaces and set WORKSPACE_ID.",
		);
	console.log(`Workspace:     ${target.name} (${target._id}, ${target.type})`);
	return target._id;
}

async function main() {
	if (!API_KEY)
		throw new Error(
			"API_KEY is not set. Run this from api-todolist-personal so Bun loads .env.",
		);

	const employees = readEmployees();
	const workspace = await resolveWorkspace();
	console.log(
		`API:           ${API_URL}${DRY ? "   (dry run, nothing is written)" : ""}\n`,
	);

	// ── Teams ──────────────────────────────────────────────────────────────
	const existingTeams = await api<Doc[]>(
		"GET",
		`/agent-teams?workspace=${workspace}`,
	);
	const teamByName = new Map(
		existingTeams.map((t) => [t.name.toLowerCase(), t._id]),
	);
	const teamIdByDivision = new Map<string, string | null>();
	const divisions = [
		...new Set(employees.map((e) => e.division).filter(Boolean)),
	] as string[];

	for (const [i, division] of divisions.entries()) {
		const name = titleCase(division);
		const found = teamByName.get(name.toLowerCase());
		if (found) {
			console.log(`= team   ${name}`);
			teamIdByDivision.set(division, found);
			continue;
		}
		if (DRY) {
			console.log(`+ team   ${name}`);
			teamIdByDivision.set(division, null);
			continue;
		}
		const team = await api<Doc>("POST", "/agent-teams", {
			name,
			color: TEAM_COLORS[i % TEAM_COLORS.length],
			position: existingTeams.length + i,
			workspace,
		});
		console.log(`+ team   ${name}`);
		teamIdByDivision.set(division, team._id);
	}

	// ── Agents ─────────────────────────────────────────────────────────────
	const existingAgents = await api<AgentDoc[]>(
		"GET",
		`/agents?workspace=${workspace}&includeArchived=true`,
	);
	const agentBySlug = new Map(existingAgents.map((a) => [a.slug, a]));
	const counts = { created: 0, updated: 0, skipped: 0, failed: 0 };

	for (const [i, e] of employees.entries()) {
		const slug = e.id.toLowerCase();
		const rolePrompt = readRolePrompt(e.id);
		const fields = {
			name: (e.name || titleCase(e.id)).slice(0, 80),
			role: (e.role || "Employee").slice(0, 120),
			team: e.division ? (teamIdByDivision.get(e.division) ?? null) : null,
			mission: (e.mission || extractMission(rolePrompt)).slice(0, 500),
			rolePrompt,
			...(e.color && HEX_RE.test(e.color) ? { color: e.color } : {}),
			vrm: e.vrm ?? null,
			model: e.model && MODEL_RE.test(e.model) ? e.model : null,
			effort: e.effort && EFFORTS.includes(e.effort) ? e.effort : null,
			projectAccess: e.projectAccess ?? "none",
			extraTools: (e.extraTools ?? []).filter((t) => MCP_RE.test(t)),
			extraFolders: e.extraFolders ?? [],
			position: i,
		};
		const label = `${slug.padEnd(20)} ${fields.name}, ${fields.role}`;
		const existing = agentBySlug.get(slug);

		try {
			if (existing && !UPDATE) {
				counts.skipped++;
				console.log(
					`= agent  ${label}${existing.isArchived ? " (archived)" : ""}`,
				);
			} else if (existing) {
				if (!DRY) await api("PATCH", `/agents/${existing._id}`, fields);
				counts.updated++;
				console.log(`~ agent  ${label}`);
			} else {
				if (!DRY) await api("POST", "/agents", { ...fields, slug, workspace });
				counts.created++;
				console.log(`+ agent  ${label}`);
			}
		} catch (err) {
			counts.failed++;
			console.error(`! agent  ${label}\n         ${(err as Error).message}`);
		}
	}

	console.log(
		`\n${DRY ? "Would create" : "Created"} ${counts.created}, ${DRY ? "would update" : "updated"} ${counts.updated}, skipped ${counts.skipped}, failed ${counts.failed}.`,
	);
	if (counts.skipped > 0 && !UPDATE)
		console.log(
			"Existing agents were left alone. Use --update to overwrite them from the office files.",
		);
	if (counts.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
	console.error(`\n${(err as Error).message}`);
	process.exitCode = 1;
});
