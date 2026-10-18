import { Elysia } from "elysia";
import { guard } from "../../libs/guard";
import { objectIdParam } from "../../libs/schema";
import {
	agentCreate,
	agentExportQuery,
	agentQuery,
	agentUpdate,
} from "./model";
import { AgentService } from "./service";

export const agentsModule = new Elysia({ prefix: "/agents" }).guard({}, (app) =>
	app
		.use(guard)
		.get("/", ({ user, query }) => AgentService.findAll(user.sub, query), {
			query: agentQuery,
		})
		// Roster in the AI office's config.json shape (used by the office sync).
		.get(
			"/export",
			({ user, query }) => AgentService.exportForOffice(user.sub, query),
			{ query: agentExportQuery },
		)
		.post("/", ({ user, body }) => AgentService.create(user.sub, body), {
			body: agentCreate,
		})
		.get(
			"/:id",
			({ user, params: { id } }) => AgentService.findById(id, user.sub),
			{ params: objectIdParam },
		)
		.patch(
			"/:id",
			({ user, params: { id }, body }) =>
				AgentService.update(id, user.sub, body),
			{ params: objectIdParam, body: agentUpdate },
		)
		.patch(
			"/:id/restore",
			({ user, params: { id } }) => AgentService.restore(id, user.sub),
			{ params: objectIdParam },
		)
		.delete(
			"/:id",
			({ user, params: { id } }) => AgentService.remove(id, user.sub),
			{ params: objectIdParam },
		),
);
