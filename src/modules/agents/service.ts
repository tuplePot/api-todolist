import { fail, ok } from "../../libs/response";
import { canManage } from "../../libs/workspaceRole";
import { AgentTeam } from "../agent-teams/schema";
import { TEAM_PROJECT_POPULATE } from "../agent-teams/service";
import { WorkspaceService } from "../workspaces/service";
import type {
	AgentCreate,
	AgentExportQuery,
	AgentQuery,
	AgentUpdate,
} from "./model";
import { Agent } from "./schema";

const TEAM_POPULATE = {
	path: "team",
	select: "name color project",
	populate: TEAM_PROJECT_POPULATE,
};

type PopulatedRoom = {
	_id: unknown;
	name: string;
	color?: string;
	project?: { _id: unknown; name: string; key: string } | null;
} | null;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export abstract class AgentService {
	/** Fetch an agent and the caller's role in its workspace. */
	private static async accessible(agentId: string, userId: string) {
		const agent = await Agent.findById(agentId);
		if (!agent) return { agent: null, role: null };
		const role = await WorkspaceService.membershipRole(
			agent.workspace.toString(),
			userId,
		);
		return { agent, role };
	}

	/** A team must exist, be active, and live in the same workspace. */
	private static async validateTeam(
		teamId: string | null | undefined,
		workspaceId: string,
	): Promise<string | null> {
		if (!teamId) return null;
		const team = await AgentTeam.findById(teamId).lean();
		if (!team) return "Agent team not found";
		if (team.workspace.toString() !== workspaceId)
			return "Agent team belongs to a different workspace";
		if (team.isArchived) return "Agent team is archived";
		return null;
	}

	/**
	 * Used by tasks: returns an error message when the agent cannot work on a
	 * task in `workspaceId` / `projectId`, or null when it can. An agent whose
	 * team (room) is bound to a project only works on that project's tickets.
	 */
	static async assignableError(
		agentId: string,
		workspaceId: string,
		projectId: string | null,
	): Promise<string | null> {
		const agent = await Agent.findById(agentId, {
			workspace: 1,
			isArchived: 1,
		}).lean();
		if (!agent) return "Agent not found";
		if (agent.workspace.toString() !== workspaceId)
			return "Agent belongs to a different workspace";
		if (agent.isArchived) return "Agent is archived";
		const room = await this.roomProjectId(agentId);
		if (room && room !== projectId)
			return "This agent works in the room of another project";
		return null;
	}

	/** Project the agent's team (room) is bound to, or null for a general room. */
	static async roomProjectId(agentId: string): Promise<string | null> {
		const agent = await Agent.findById(agentId, { team: 1 }).lean();
		if (!agent?.team) return null;
		const team = await AgentTeam.findById(agent.team, { project: 1 }).lean();
		return team?.project?.toString() ?? null;
	}

	/** Teams of the workspace bound to a project other than `projectId`. */
	private static async otherProjectTeamIds(
		workspaceId: string,
		projectId: string,
	) {
		const teams = await AgentTeam.find(
			{ workspace: workspaceId, project: { $nin: [null, projectId] } },
			{ _id: 1 },
		).lean();
		return teams.map((t) => t._id);
	}

	static async findAll(userId: string, query: AgentQuery) {
		const role = await WorkspaceService.membershipRole(query.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");

		const filter: Record<string, unknown> = { workspace: query.workspace };
		if (!query.includeArchived) filter.isArchived = false;
		if (query.team) filter.team = query.team;
		if (query.projectAccess) filter.projectAccess = query.projectAccess;
		if (query.project) {
			const excluded = await this.otherProjectTeamIds(
				query.workspace,
				query.project,
			);
			filter.$and = [{ team: { $nin: excluded } }];
		}
		if (query.search) {
			const re = new RegExp(escapeRegex(query.search), "i");
			filter.$or = [{ name: re }, { role: re }, { slug: re }];
		}

		const agents = await Agent.find(filter)
			.sort({ position: 1, createdAt: 1 })
			.populate(TEAM_POPULATE)
			.lean();
		return ok(agents, "Agents fetched");
	}

	static async findById(id: string, userId: string) {
		const { agent, role } = await this.accessible(id, userId);
		if (!agent) return fail(404, "Agent not found");
		if (!role) return fail(403, "You do not have access to this agent");
		await agent.populate(TEAM_POPULATE);
		return ok(agent, "Agent fetched");
	}

	static async create(userId: string, data: AgentCreate) {
		const role = await WorkspaceService.membershipRole(data.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");
		if (!canManage(role))
			return fail(403, "Only workspace owners/admins can manage agents");

		const teamError = await this.validateTeam(data.team, data.workspace);
		if (teamError) return fail(400, teamError);

		// Archived agents keep their slug reserved so office history never mixes.
		const taken = await Agent.exists({
			workspace: data.workspace,
			slug: data.slug,
		});
		if (taken)
			return fail(
				409,
				"An agent with this slug already exists in the workspace",
			);

		const agent = await Agent.create({ ...data, owner: userId });
		await agent.populate(TEAM_POPULATE);
		return ok(agent, "Agent created");
	}

	static async update(id: string, userId: string, data: AgentUpdate) {
		const { agent, role } = await this.accessible(id, userId);
		if (!agent) return fail(404, "Agent not found");
		if (!role) return fail(403, "You do not have access to this agent");
		if (!canManage(role))
			return fail(403, "Only workspace owners/admins can manage agents");

		if (data.team !== undefined) {
			const teamError = await this.validateTeam(
				data.team,
				agent.workspace.toString(),
			);
			if (teamError) return fail(400, teamError);
		}

		Object.assign(agent, data);
		await agent.save();
		await agent.populate(TEAM_POPULATE);
		return ok(agent, "Agent updated");
	}

	/** Soft delete. Tasks keep the reference (shown as an archived agent). */
	static async remove(id: string, userId: string) {
		const { agent, role } = await this.accessible(id, userId);
		if (!agent) return fail(404, "Agent not found");
		if (!role) return fail(403, "You do not have access to this agent");
		if (!canManage(role))
			return fail(403, "Only workspace owners/admins can manage agents");

		if (agent.isArchived) return ok(agent, "Agent already archived");
		agent.isArchived = true;
		await agent.save();
		return ok(agent, "Agent archived");
	}

	static async restore(id: string, userId: string) {
		const { agent, role } = await this.accessible(id, userId);
		if (!agent) return fail(404, "Agent not found");
		if (!role) return fail(403, "You do not have access to this agent");
		if (!canManage(role))
			return fail(403, "Only workspace owners/admins can manage agents");

		if (!agent.isArchived) return ok(agent, "Agent is not archived");
		agent.isArchived = false;
		await agent.save();
		return ok(agent, "Agent restored");
	}

	/**
	 * Active agents in the exact shape of the AI office's `kantor/config.json`
	 * `employees[]` (+ `rolePrompt` for each employee's CLAUDE.md), so the office
	 * can sync its roster from the database.
	 */
	static async exportForOffice(userId: string, query: AgentExportQuery) {
		const role = await WorkspaceService.membershipRole(query.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");

		const [agents, teams] = await Promise.all([
			Agent.find({ workspace: query.workspace, isArchived: false })
				.sort({ position: 1, createdAt: 1 })
				.populate<{ team: PopulatedRoom }>(TEAM_POPULATE)
				.lean(),
			AgentTeam.find({ workspace: query.workspace, isArchived: false })
				.sort({ position: 1, createdAt: 1 })
				.populate<{ project: NonNullable<PopulatedRoom>["project"] }>(
					TEAM_PROJECT_POPULATE,
				)
				.lean(),
		]);

		// Rooms of the office: one per team; a team bound to a project is that
		// project's room, so the office can lay out e.g. "Floor 1: DolphinPOS".
		const project = (p: NonNullable<PopulatedRoom>["project"]) =>
			p ? { _id: p._id, key: p.key, name: p.name } : null;
		const rooms = teams.map((t) => ({
			id: t._id,
			name: t.name,
			color: t.color ?? null,
			project: project(t.project),
		}));

		const employees = agents.map((a) => ({
			id: a.slug,
			agentId: a._id,
			name: a.name,
			role: a.role,
			division: a.team?.name?.toLowerCase() ?? null,
			roomId: a.team?._id ?? null,
			project: project(a.team?.project),
			mission: a.mission ?? "",
			color: a.color ?? null,
			vrm: a.vrm ?? null,
			extraTools: a.extraTools ?? [],
			extraFolders: a.extraFolders ?? [],
			projectAccess: a.projectAccess,
			model: a.model ?? null,
			effort: a.effort ?? null,
			rolePrompt: a.rolePrompt ?? "",
			updatedAt: (a as { updatedAt?: Date }).updatedAt ?? null,
		}));

		return ok({ rooms, employees }, "Agents exported for the AI office");
	}
}
