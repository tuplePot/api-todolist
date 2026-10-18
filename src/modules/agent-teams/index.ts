import { Elysia } from "elysia";
import { guard } from "../../libs/guard";
import { objectIdParam } from "../../libs/schema";
import { agentTeamCreate, agentTeamQuery, agentTeamUpdate } from "./model";
import { AgentTeamService } from "./service";

export const agentTeamsModule = new Elysia({ prefix: "/agent-teams" }).guard(
	{},
	(app) =>
		app
			.use(guard)
			.get(
				"/",
				({ user, query }) => AgentTeamService.findAll(user.sub, query),
				{ query: agentTeamQuery },
			)
			.post("/", ({ user, body }) => AgentTeamService.create(user.sub, body), {
				body: agentTeamCreate,
			})
			.get(
				"/:id",
				({ user, params: { id } }) => AgentTeamService.findById(id, user.sub),
				{ params: objectIdParam },
			)
			.patch(
				"/:id",
				({ user, params: { id }, body }) =>
					AgentTeamService.update(id, user.sub, body),
				{ params: objectIdParam, body: agentTeamUpdate },
			)
			.delete(
				"/:id",
				({ user, params: { id } }) => AgentTeamService.remove(id, user.sub),
				{ params: objectIdParam },
			),
);
