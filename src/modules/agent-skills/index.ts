import { Elysia } from "elysia";
import { guard } from "../../libs/guard";
import { objectIdParam } from "../../libs/schema";
import { agentSkillCreate, agentSkillQuery, agentSkillUpdate } from "./model";
import { AgentSkillService } from "./service";

export const agentSkillsModule = new Elysia({ prefix: "/agent-skills" }).guard(
	{},
	(app) =>
		app
			.use(guard)
			.get(
				"/",
				({ user, query }) => AgentSkillService.findAll(user.sub, query),
				{ query: agentSkillQuery },
			)
			.post(
				"/",
				({ user, body }) => AgentSkillService.create(user.sub, body),
				{ body: agentSkillCreate },
			)
			.get(
				"/:id",
				({ user, params: { id } }) => AgentSkillService.findById(id, user.sub),
				{ params: objectIdParam },
			)
			.patch(
				"/:id",
				({ user, params: { id }, body }) =>
					AgentSkillService.update(id, user.sub, body),
				{ params: objectIdParam, body: agentSkillUpdate },
			)
			.delete(
				"/:id",
				({ user, params: { id } }) => AgentSkillService.remove(id, user.sub),
				{ params: objectIdParam },
			),
);
