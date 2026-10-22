import { t } from "elysia";
import { objectId } from "../../libs/schema";
import { SKILL_PROMPT_MAX } from "./prompt";

// ─── TypeBox schemas ──────────────────────────────────────────────────────────

export const agentSkillCreate = t.Object({
	name: t.String({ minLength: 1, maxLength: 80 }),
	role: t.String({ minLength: 1, maxLength: 120 }),
	description: t.Optional(t.String({ maxLength: 500 })),
	prompt: t.String({ maxLength: SKILL_PROMPT_MAX }),
	position: t.Optional(t.Number()),
	workspace: objectId,
});

export const agentSkillUpdate = t.Partial(
	t.Object({
		name: t.String({ minLength: 1, maxLength: 80 }),
		role: t.String({ minLength: 1, maxLength: 120 }),
		description: t.String({ maxLength: 500 }),
		prompt: t.String({ maxLength: SKILL_PROMPT_MAX }),
		position: t.Number(),
	}),
);

export const agentSkillQuery = t.Object({
	workspace: objectId,
	includeArchived: t.Optional(t.BooleanString()),
});

export type AgentSkillCreate = typeof agentSkillCreate.static;
export type AgentSkillUpdate = typeof agentSkillUpdate.static;
export type AgentSkillQuery = typeof agentSkillQuery.static;
