import { fail, ok } from "../../libs/response";
import { canManage } from "../../libs/workspaceRole";
import { AgentTeam } from "../agent-teams/schema";
import { WorkspaceService } from "../workspaces/service";
import type {
	AgentCreate,
	AgentExportQuery,
	AgentQuery,
	AgentUpdate,
} from "./model";
import { Agent } from "./schema";

const TEAM_POPULATE = { path: "team", select: "name color" };

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
	 * Used by tasks: returns an error message when the agent cannot be assigned
	 * to a task in `workspaceId`, or null when it can.
	 */
	static async assignableError(
		agentId: string,
		workspaceId: string,
	): Promise<string | null> {
		const agent = await Agent.findById(agentId, {
			workspace: 1,
			isArchived: 1,
		}).lean();
		if (!agent) return "Agent not found";
		if (agent.workspace.toString() !== workspaceId)
			return "Agent belongs to a different workspace";
		if (agent.isArchived) return "Agent is archived";
		return null;
	}

	static async findAll(userId: string, query: AgentQuery) {
		const role = await WorkspaceService.membershipRole(query.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");

		const filter: Record<string, unknown> = { workspace: query.workspace };
		if (!query.includeArchived) filter.isArchived = false;
		if (query.team) filter.team = query.team;
		if (query.projectAccess) filter.projectAccess = query.projectAccess;
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

		const agents = await Agent.find({
			workspace: query.workspace,
			isArchived: false,
		})
			.sort({ position: 1, createdAt: 1 })
			.populate<{ team: { _id: unknown; name: string } | null }>(TEAM_POPULATE)
			.lean();

		const employees = agents.map((a) => ({
			id: a.slug,
			agentId: a._id,
			name: a.name,
			role: a.role,
			division: a.team?.name?.toLowerCase() ?? null,
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

		return ok({ employees }, "Agents exported for the AI office");
	}
}
