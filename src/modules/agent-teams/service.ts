import { fail, ok } from "../../libs/response";
import { canManage } from "../../libs/workspaceRole";
import { WorkspaceService } from "../workspaces/service";
import type { AgentTeamCreate, AgentTeamQuery, AgentTeamUpdate } from "./model";
import { AgentTeam } from "./schema";

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

	static async findAll(userId: string, query: AgentTeamQuery) {
		const role = await WorkspaceService.membershipRole(query.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");

		const filter: Record<string, unknown> = { workspace: query.workspace };
		if (!query.includeArchived) filter.isArchived = false;

		const teams = await AgentTeam.find(filter)
			.sort({ position: 1, createdAt: 1 })
			.lean();
		return ok(teams, "Agent teams fetched");
	}

	static async findById(id: string, userId: string) {
		const { team, role } = await this.accessible(id, userId);
		if (!team) return fail(404, "Agent team not found");
		if (!role) return fail(403, "You do not have access to this agent team");
		return ok(team, "Agent team fetched");
	}

	static async create(userId: string, data: AgentTeamCreate) {
		const role = await WorkspaceService.membershipRole(data.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");
		if (!canManage(role))
			return fail(403, "Only workspace owners/admins can manage agent teams");

		const duplicate = await AgentTeam.exists({
			workspace: data.workspace,
			name: data.name.trim(),
			isArchived: false,
		});
		if (duplicate) return fail(409, "A team with this name already exists");

		const team = await AgentTeam.create({ ...data, owner: userId });
		return ok(team, "Agent team created");
	}

	static async update(id: string, userId: string, data: AgentTeamUpdate) {
		const { team, role } = await this.accessible(id, userId);
		if (!team) return fail(404, "Agent team not found");
		if (!role) return fail(403, "You do not have access to this agent team");
		if (!canManage(role))
			return fail(403, "Only workspace owners/admins can manage agent teams");

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
