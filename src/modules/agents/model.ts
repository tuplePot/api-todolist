import { t } from "elysia";
import { objectId } from "../../libs/schema";

// ─── Shared field schemas ─────────────────────────────────────────────────────

// Same rule the AI office uses for employee ids (they become folder names).
export const AGENT_SLUG_PATTERN = "^[a-z0-9][a-z0-9._-]*$";
// Same rule the office uses before passing `--model` to the CLI.
const MODEL_PATTERN = "^[\\w.\\-\\[\\]]+$";
// Connectors only, never built-in tools like Bash/Write — those are decided by
// `projectAccess` and the office's permission files, not by data in the DB.
const MCP_TOOL_PATTERN = "^mcp__[A-Za-z0-9_*-]+$";

const hexColor = t.String({ pattern: "^#[0-9a-fA-F]{6}$" });
const effort = t.Union([
	t.Literal("low"),
	t.Literal("medium"),
	t.Literal("high"),
	t.Literal("xhigh"),
	t.Literal("max"),
]);
const projectAccess = t.Union([
	t.Literal("none"),
	t.Literal("read"),
	t.Literal("edit"),
]);
const extraTools = t.Array(
	t.String({ pattern: MCP_TOOL_PATTERN, maxLength: 120 }),
	{ maxItems: 30 },
);
const extraFolders = t.Array(t.String({ minLength: 1, maxLength: 300 }), {
	maxItems: 10,
});

// ─── Request schemas ──────────────────────────────────────────────────────────

export const agentCreate = t.Object({
	slug: t.String({ pattern: AGENT_SLUG_PATTERN, minLength: 1, maxLength: 60 }),
	name: t.String({ minLength: 1, maxLength: 80 }),
	role: t.String({ minLength: 1, maxLength: 120 }),
	team: t.Optional(t.Union([objectId, t.Null()])),
	mission: t.Optional(t.String({ maxLength: 500 })),
	// Left out → the active skill of the agent's role is linked automatically.
	skill: t.Optional(t.Union([objectId, t.Null()])),
	color: t.Optional(hexColor),
	vrm: t.Optional(t.Union([t.String({ maxLength: 200 }), t.Null()])),
	model: t.Optional(
		t.Union([t.String({ pattern: MODEL_PATTERN, maxLength: 80 }), t.Null()]),
	),
	effort: t.Optional(t.Union([effort, t.Null()])),
	projectAccess: t.Optional(projectAccess),
	extraTools: t.Optional(extraTools),
	extraFolders: t.Optional(extraFolders),
	position: t.Optional(t.Number()),
	workspace: objectId,
});

// `slug` is deliberately not editable: the office keys chat history and the
// employee folder by it. Create a new agent instead of renaming.
export const agentUpdate = t.Partial(
	t.Object({
		name: t.String({ minLength: 1, maxLength: 80 }),
		role: t.String({ minLength: 1, maxLength: 120 }),
		team: t.Union([objectId, t.Null()]),
		mission: t.String({ maxLength: 500 }),
		skill: t.Union([objectId, t.Null()]),
		color: t.Union([hexColor, t.Null()]),
		vrm: t.Union([t.String({ maxLength: 200 }), t.Null()]),
		model: t.Union([
			t.String({ pattern: MODEL_PATTERN, maxLength: 80 }),
			t.Null(),
		]),
		effort: t.Union([effort, t.Null()]),
		projectAccess,
		extraTools,
		extraFolders,
		position: t.Number(),
	}),
);

export const agentQuery = t.Object({
	workspace: objectId,
	team: t.Optional(objectId),
	/** Only agents that may take tickets of this project (its room or a general one). */
	project: t.Optional(objectId),
	projectAccess: t.Optional(projectAccess),
	search: t.Optional(t.String({ maxLength: 100 })),
	includeArchived: t.Optional(t.BooleanString()),
});

export const agentExportQuery = t.Object({ workspace: objectId });

export type AgentCreate = typeof agentCreate.static;
export type AgentUpdate = typeof agentUpdate.static;
export type AgentQuery = typeof agentQuery.static;
export type AgentExportQuery = typeof agentExportQuery.static;
