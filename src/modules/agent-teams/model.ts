import { t } from "elysia";
import { objectId } from "../../libs/schema";

// ─── TypeBox schemas ──────────────────────────────────────────────────────────

const hexColor = t.String({ pattern: "^#[0-9a-fA-F]{6}$" });

export const agentTeamCreate = t.Object({
	name: t.String({ minLength: 1, maxLength: 80 }),
	description: t.Optional(t.String({ maxLength: 500 })),
	color: t.Optional(hexColor),
	project: t.Optional(t.Union([objectId, t.Null()])),
	position: t.Optional(t.Number()),
	workspace: objectId,
});

export const agentTeamUpdate = t.Partial(
	t.Object({
		name: t.String({ minLength: 1, maxLength: 80 }),
		description: t.String({ maxLength: 500 }),
		color: t.Union([hexColor, t.Null()]),
		project: t.Union([objectId, t.Null()]),
		position: t.Number(),
	}),
);

export const agentTeamQuery = t.Object({
	workspace: objectId,
	project: t.Optional(objectId),
	includeArchived: t.Optional(t.BooleanString()),
});

export type AgentTeamCreate = typeof agentTeamCreate.static;
export type AgentTeamUpdate = typeof agentTeamUpdate.static;
export type AgentTeamQuery = typeof agentTeamQuery.static;
