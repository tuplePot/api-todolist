/**
 * Migration: move each agent's own role prompt into shared Agent Skills.
 *
 * Before: every agent stored its full prompt (`rolePrompt`).
 * After:  one skill per role holds the prompt, with the agent's name replaced
 *         by {{AGENT_NAME}}; agents of that role link to it and their own copy
 *         is removed. The office still gets the same final prompt per agent.
 *
 * Per role (among agents that have no skill yet):
 *   - A skill for the role already exists → link the agents to it.
 *   - Otherwise → create the skill from the agents' prompt (name swapped for
 *     {{AGENT_NAME}}); the API links every agent of that role.
 *   - If agents of one role have different prompts (after the name swap), the
 *     role is skipped and listed, so no custom prompt is lost by accident.
 *     Pass --force to use the most common prompt anyway.
 *
 * Goes through the running API (same auth as import:agents: API_KEY /
 * API_USER_ID from .env). Idempotent: linked agents are skipped.
 *
 * Run:
 *   bun run migrate:agent-skills --workspaces   # list your workspaces
 *   bun run migrate:agent-skills --dry          # show the plan, write nothing
 *   bun run migrate:agent-skills                # migrate
 *   bun run migrate:agent-skills --force        # also roles with differing prompts
 *
 * Env (optional): IMPORT_API_URL, WORKSPACE_ID (default: personal workspace).
 */

import { roleKeyOf, templatizePrompt } from "../src/modules/agent-skills/prompt";

interface Envelope<T> {
	success: boolean;
	message: string;
	data: T;
	errors?: unknown;
}

type WorkspaceDoc = {
	_id: string;
	name: string;
	type: "personal" | "team";
};
type AgentDoc = {
	_id: string;
	slug: string;
	name: string;
	role: string;
	skill: { _id: string } | string | null;
	rolePrompt?: string;
};
type SkillDoc = { _id: string; name: string; role: string; prompt?: string };

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry");
const FORCE = args.has("--force");
const LIST_WORKSPACES = args.has("--workspaces");

const API_URL = (
	process.env.IMPORT_API_URL ?? `http://localhost:${process.env.PORT ?? 5000}`
).replace(/\/+$/, "");
const API_KEY = process.env.API_KEY;
const ACTING_USER = process.env.API_USER_ID;

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

async function resolveWorkspace(): Promise<string> {
	const workspaces = await api<WorkspaceDoc[]>("GET", "/workspaces");
	if (LIST_WORKSPACES) {
		console.log("Your workspaces:");
		for (const w of workspaces)
			console.log(`  ${w._id}  ${w.type.padEnd(8)}  ${w.name}`);
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
	console.log(`Workspace: ${target.name} (${target._id})`);
	return target._id;
}

/** Most common value, first seen wins ties. */
function mostCommon(values: string[]): { value: string; count: number } {
	const counts = new Map<string, number>();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	let best = { value: values[0], count: 0 };
	for (const [value, count] of counts)
		if (count > best.count) best = { value, count };
	return best;
}

async function main() {
	if (!API_KEY)
		throw new Error(
			"API_KEY is not set. Run this from api-todolist-personal so Bun loads .env.",
		);
	const workspace = await resolveWorkspace();
	console.log(`API:       ${API_URL}${DRY ? "   (dry run)" : ""}\n`);

	const [agents, skills] = await Promise.all([
		api<AgentDoc[]>(
			"GET",
			`/agents?workspace=${workspace}&includeArchived=true`,
		),
		api<SkillDoc[]>("GET", `/agent-skills?workspace=${workspace}`),
	]);
	const skillByRole = new Map(skills.map((s) => [roleKeyOf(s.role), s]));

	// The list leaves prompts out; fetch each unlinked agent in full.
	const unlinked: AgentDoc[] = [];
	for (const a of agents) {
		if (a.skill) continue;
		unlinked.push(await api<AgentDoc>("GET", `/agents/${a._id}`));
	}
	console.log(
		`${agents.length} agents, ${unlinked.length} without a skill, ${skills.length} skills.\n`,
	);

	const byRole = new Map<string, AgentDoc[]>();
	for (const a of unlinked) {
		const key = roleKeyOf(a.role);
		byRole.set(key, [...(byRole.get(key) ?? []), a]);
	}

	const counts = { created: 0, linked: 0, skipped: 0, failed: 0 };

	for (const [key, group] of byRole) {
		const role = group[0].role;
		const label = `${role} (${group.map((a) => a.name).join(", ")})`;
		const templates = group
			.filter((a) => a.rolePrompt?.trim())
			.map((a) => ({
				agent: a,
				prompt: templatizePrompt(a.rolePrompt as string, a.name),
			}));

		try {
			const existing = skillByRole.get(key);
			if (existing) {
				// Link to the existing skill, unless an agent's prompt differs.
				const full = await api<SkillDoc>(
					"GET",
					`/agent-skills/${existing._id}`,
				);
				for (const a of group) {
					const own = templates.find((t) => t.agent._id === a._id)?.prompt;
					if (own && own !== full.prompt && !FORCE) {
						counts.skipped++;
						console.log(
							`! keep   ${a.slug}: its prompt differs from skill "${existing.name}" (use --force to replace it)`,
						);
						continue;
					}
					if (!DRY)
						await api("PATCH", `/agents/${a._id}`, { skill: existing._id });
					counts.linked++;
					console.log(`~ link   ${a.slug} → ${existing.name}`);
				}
				continue;
			}

			if (templates.length === 0) {
				counts.skipped++;
				console.log(`= skip   ${label}: no prompt to turn into a skill`);
				continue;
			}

			const best = mostCommon(templates.map((t) => t.prompt));
			const differing = templates.filter((t) => t.prompt !== best.value);
			if (differing.length > 0 && !FORCE) {
				counts.skipped += group.length;
				console.log(
					`! skip   ${label}: prompts differ (${differing.map((t) => t.agent.slug).join(", ")}). Make them match or use --force.`,
				);
				continue;
			}

			// Creating the skill links every agent of this role (API side).
			if (!DRY)
				await api("POST", "/agent-skills", {
					name: role.slice(0, 80),
					role,
					description: "Migrated from the agents' own role prompts.",
					prompt: best.value,
					workspace,
				});
			counts.created++;
			counts.linked += group.length;
			console.log(
				`+ skill  ${label}${differing.length ? `  (forced; replaced ${differing.length} differing prompt(s))` : ""}`,
			);
		} catch (err) {
			counts.failed++;
			console.error(`! fail   ${label}\n         ${(err as Error).message}`);
		}
	}

	console.log(
		`\n${DRY ? "Would create" : "Created"} ${counts.created} skills, ${DRY ? "would link" : "linked"} ${counts.linked} agents, skipped ${counts.skipped}, failed ${counts.failed}.`,
	);
	if (counts.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
	console.error(`\n${(err as Error).message}`);
	process.exitCode = 1;
});
