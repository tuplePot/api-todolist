import { fail, ok } from "../../libs/response";
import { canManage } from "../../libs/workspaceRole";
import { Project } from "../projects/schema";
import { WorkspaceService } from "../workspaces/service";
import type { AgentTeamCreate, AgentTeamQuery, AgentTeamUpdate } from "./model";
import { AgentTeam } from "./schema";

export const TEAM_PROJECT_POPULATE = {
	path: "project",
	select: "name key color isArchived",
};

export abstract class AgentTeamService {
	/** Fetch a team and the caller's role in its workspace. */
	private static async accessible(teamId: string, userId: string) {
		const team = await AgentTeam.findById(teamId);
		if (!team) return { team: null, role: null };
		const role = await WorkspaceService.membershipRole(
			team.workspace.toString(),
			userId,
		);
		return { team, role };
	}

	/** A team's project must exist, be active, and live in the same workspace. */
	private static async validateProject(
		projectId: string | null | undefined,
		workspaceId: string,
	): Promise<string | null> {
		if (!projectId) return null;
		const project = await Project.findById(projectId, {
			workspace: 1,
			isArchived: 1,
		}).lean();
		if (!project) return "Project not found";
		if (project.workspace.toString() !== workspaceId)
			return "Project belongs to a different workspace";
		if (project.isArchived) return "Project is archived";
		return null;
	}

	static async findAll(userId: string, query: AgentTeamQuery) {
		const role = await WorkspaceService.membershipRole(query.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");

		const filter: Record<string, unknown> = { workspace: query.workspace };
		if (!query.includeArchived) filter.isArchived = false;
		if (query.project) filter.project = query.project;

		const teams = await AgentTeam.find(filter)
			.sort({ position: 1, createdAt: 1 })
			.populate(TEAM_PROJECT_POPULATE)
			.lean();
		return ok(teams, "Agent teams fetched");
	}

	static async findById(id: string, userId: string) {
		const { team, role } = await this.accessible(id, userId);
		if (!team) return fail(404, "Agent team not found");
		if (!role) return fail(403, "You do not have access to this agent team");
		await team.populate(TEAM_PROJECT_POPULATE);
		return ok(team, "Agent team fetched");
	}

	static async create(userId: string, data: AgentTeamCreate) {
		const role = await WorkspaceService.membershipRole(data.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");
		if (!canManage(role))
			return fail(403, "Only workspace owners/admins can manage agent teams");

		const projectError = await this.validateProject(
			data.project,
			data.workspace,
		);
		if (projectError) return fail(400, projectError);

		const duplicate = await AgentTeam.exists({
			workspace: data.workspace,
			name: data.name.trim(),
			isArchived: false,
		});
		if (duplicate) return fail(409, "A team with this name already exists");

		const team = await AgentTeam.create({ ...data, owner: userId });
		await team.populate(TEAM_PROJECT_POPULATE);
		return ok(team, "Agent team created");
	}

	static async update(id: string, userId: string, data: AgentTeamUpdate) {
		const { team, role } = await this.accessible(id, userId);
		if (!team) return fail(404, "Agent team not found");
		if (!role) return fail(403, "You do not have access to this agent team");
		if (!canManage(role))
			return fail(403, "Only workspace owners/admins can manage agent teams");

		if (data.project !== undefined) {
			const projectError = await this.validateProject(
				data.project,
				team.workspace.toString(),
			);
			if (projectError) return fail(400, projectError);
		}

		if (data.name && data.name.trim() !== team.name) {
			const duplicate = await AgentTeam.exists({
				_id: { $ne: team._id },
				workspace: team.workspace,
				name: data.name.trim(),
				isArchived: false,
			});
			if (duplicate) return fail(409, "A team with this name already exists");
		}

		Object.assign(team, data);
		await team.save();
		await team.populate(TEAM_PROJECT_POPULATE);
		return ok(team, "Agent team updated");
	}

	/** Soft delete. Agents keep pointing at the archived team until reassigned. */
	static async remove(id: string, userId: string) {
		const { team, role } = await this.accessible(id, userId);
		if (!team) return fail(404, "Agent team not found");
		if (!role) return fail(403, "You do not have access to this agent team");
		if (!canManage(role))
			return fail(403, "Only workspace owners/admins can manage agent teams");

		if (team.isArchived) return ok(team, "Agent team already archived");
		team.isArchived = true;
		await team.save();
		return ok(team, "Agent team archived");
	}
}
