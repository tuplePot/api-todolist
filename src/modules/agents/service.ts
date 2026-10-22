import type { Types } from "mongoose";
import { fail, ok } from "../../libs/response";
import { canManage } from "../../libs/workspaceRole";
import { renderSkillPrompt, roleKeyOf } from "../agent-skills/prompt";
import { AgentSkill } from "../agent-skills/schema";
import { AgentSkillService } from "../agent-skills/service";
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

// The prompt itself stays out of agent responses; it lives on the skill.
const SKILL_POPULATE = { path: "skill", select: "name role isArchived" };
const AGENT_POPULATE = [TEAM_POPULATE, SKILL_POPULATE];

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
	 * Which skill an agent with `role` gets. `undefined` = pick the active skill
	 * of that role (or none); `null` = no skill; an id must be an active skill
	 * of the same workspace and the same role.
	 */
	private static async resolveSkill(
		skillId: string | null | undefined,
		role: string,
		workspaceId: string,
	): Promise<
		{ skill: Types.ObjectId | null; error?: undefined } | { error: string }
	> {
		if (skillId === undefined) {
			const match = await AgentSkillService.findForRole(workspaceId, role);
			return { skill: match?._id ?? null };
		}
		if (skillId === null) return { skill: null };
		const skill = await AgentSkill.findById(skillId, {
			workspace: 1,
			roleKey: 1,
			role: 1,
			isArchived: 1,
		}).lean();
		if (!skill) return { error: "Agent skill not found" };
		if (skill.workspace.toString() !== workspaceId)
			return { error: "Agent skill belongs to a different workspace" };
		if (skill.isArchived) return { error: "Agent skill is archived" };
		if (skill.roleKey !== roleKeyOf(role))
			return { error: `This skill is for the "${skill.role}" role` };
		return { skill: skill._id };
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

		const agents = await Agent.find(filter, { rolePrompt: 0 })
			.sort({ position: 1, createdAt: 1 })
			.populate(AGENT_POPULATE)
			.lean();
		return ok(agents, "Agents fetched");
	}

	static async findById(id: string, userId: string) {
		const { agent, role } = await this.accessible(id, userId);
		if (!agent) return fail(404, "Agent not found");
		if (!role) return fail(403, "You do not have access to this agent");
		await agent.populate(AGENT_POPULATE);
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

		const resolved = await this.resolveSkill(
			data.skill,
			data.role,
			data.workspace,
		);
		if (resolved.error !== undefined) return fail(400, resolved.error);

		const agent = await Agent.create({
			...data,
			skill: resolved.skill,
			// Prompts live on skills now; never store a per-agent copy.
			rolePrompt: undefined,
			owner: userId,
		});
		await agent.populate(AGENT_POPULATE);
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

		// The skill follows the role: re-check an explicit pick, or re-pick the
		// role's skill when only the role changed.
		const nextRole = data.role ?? agent.role;
		const roleChanged =
			data.role !== undefined && roleKeyOf(data.role) !== roleKeyOf(agent.role);
		const { skill: skillInput, ...rest } = data;
		let skillChange: { skill: Types.ObjectId | null } | null = null;
		if (skillInput !== undefined || roleChanged) {
			const resolved = await this.resolveSkill(
				skillInput,
				nextRole,
				agent.workspace.toString(),
			);
			if (resolved.error !== undefined) return fail(400, resolved.error);
			skillChange = { skill: resolved.skill };
		}

		Object.assign(agent, rest);
		if (skillChange) agent.set("skill", skillChange.skill);
		// A linked skill replaces the agent's own (legacy) prompt.
		if (agent.skill) agent.set("rolePrompt", undefined);
		await agent.save();
		await agent.populate(AGENT_POPULATE);
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
	 * can sync its roster from the database. `rolePrompt` is the agent's skill
	 * with its name filled in (or the legacy per-agent prompt when unlinked).
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

		const skillIds = [
			...new Set(agents.map((a) => a.skill?.toString()).filter(Boolean)),
		];
		const skills = skillIds.length
			? await AgentSkill.find(
					{ _id: { $in: skillIds } },
					{ name: 1, prompt: 1, updatedAt: 1 },
				).lean()
			: [];
		const skillById = new Map(skills.map((s) => [s._id.toString(), s]));

		const latest = (a?: Date | null, b?: Date | null) =>
			a && b ? (a > b ? a : b) : (a ?? b ?? null);

		const employees = agents.map((a) => {
			const skill = a.skill ? skillById.get(a.skill.toString()) : undefined;
			const skillUpdatedAt = (skill as { updatedAt?: Date } | undefined)
				?.updatedAt;
			return {
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
				skill: skill ? { id: skill._id, name: skill.name } : null,
				rolePrompt: skill
					? renderSkillPrompt(skill.prompt ?? "", a.name)
					: (a.rolePrompt ?? ""),
				// A skill edit changes the prompt too, so the office must re-sync.
				updatedAt: latest(
					(a as { updatedAt?: Date }).updatedAt,
					skillUpdatedAt,
				),
			};
		});

		return ok({ rooms, employees }, "Agents exported for the AI office");
	}
}
