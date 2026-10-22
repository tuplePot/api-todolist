import { Types } from "mongoose";
import { fail, ok } from "../../libs/response";
import { canManage } from "../../libs/workspaceRole";
import { Agent } from "../agents/schema";
import { WorkspaceService } from "../workspaces/service";
import type {
	AgentSkillCreate,
	AgentSkillQuery,
	AgentSkillUpdate,
} from "./model";
import { roleKeyOf } from "./prompt";
import { AgentSkill } from "./schema";

const MANAGE_ONLY = "Only workspace owners/admins can manage agent skills";

export abstract class AgentSkillService {
	/** Fetch a skill and the caller's role in its workspace. */
	private static async accessible(skillId: string, userId: string) {
		const skill = await AgentSkill.findById(skillId);
		if (!skill) return { skill: null, role: null };
		const role = await WorkspaceService.membershipRole(
			skill.workspace.toString(),
			userId,
		);
		return { skill, role };
	}

	/** The active skill for `role` in a workspace, if any. */
	static async findForRole(workspaceId: string, role: string) {
		return AgentSkill.findOne(
			{ workspace: workspaceId, roleKey: roleKeyOf(role), isArchived: false },
			{ prompt: 0 },
		).lean();
	}

	private static activeAgentCount(skillId: unknown) {
		return Agent.countDocuments({ skill: skillId, isArchived: false });
	}

	/**
	 * Link every agent of the workspace that has this skill's role and no skill
	 * yet. Their own (legacy) role prompt is dropped: the skill replaces it.
	 */
	private static async linkUnlinkedAgents(
		skillId: Types.ObjectId,
		workspaceId: Types.ObjectId,
		roleKey: string,
	): Promise<number> {
		const candidates = await Agent.find(
			{ workspace: workspaceId, skill: null },
			{ role: 1 },
		).lean();
		const ids = candidates
			.filter((a) => roleKeyOf(a.role) === roleKey)
			.map((a) => a._id);
		if (ids.length === 0) return 0;
		await Agent.updateMany(
			{ _id: { $in: ids } },
			{ $set: { skill: skillId }, $unset: { rolePrompt: 1 } },
		);
		return ids.length;
	}

	private static duplicateRole(
		workspaceId: unknown,
		roleKey: string,
		exceptId?: unknown,
	) {
		return AgentSkill.exists({
			workspace: workspaceId,
			roleKey,
			isArchived: false,
			...(exceptId ? { _id: { $ne: exceptId } } : {}),
		});
	}

	static async findAll(userId: string, query: AgentSkillQuery) {
		const role = await WorkspaceService.membershipRole(query.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");

		const workspace = new Types.ObjectId(query.workspace);
		const match: Record<string, unknown> = { workspace };
		if (!query.includeArchived) match.isArchived = false;

		// Lists leave the (large) prompt out; the detail endpoint returns it.
		const [skills, counts] = await Promise.all([
			AgentSkill.aggregate([
				{ $match: match },
				{ $sort: { position: 1, createdAt: 1 } },
				{
					$addFields: {
						promptLength: { $strLenCP: { $ifNull: ["$prompt", ""] } },
					},
				},
				{ $project: { prompt: 0 } },
			]),
			Agent.aggregate<{ _id: Types.ObjectId; n: number }>([
				{ $match: { workspace, isArchived: false, skill: { $ne: null } } },
				{ $group: { _id: "$skill", n: { $sum: 1 } } },
			]),
		]);
		const countById = new Map(counts.map((c) => [String(c._id), c.n]));
		return ok(
			skills.map((s) => ({
				...s,
				agentCount: countById.get(String(s._id)) ?? 0,
			})),
			"Agent skills fetched",
		);
	}

	static async findById(id: string, userId: string) {
		const { skill, role } = await this.accessible(id, userId);
		if (!skill) return fail(404, "Agent skill not found");
		if (!role) return fail(403, "You do not have access to this agent skill");

		const agents = await Agent.find(
			{ skill: skill._id, isArchived: false },
			{ slug: 1, name: 1, color: 1 },
		)
			.sort({ position: 1, createdAt: 1 })
			.lean();
		return ok(
			{ ...skill.toObject(), agentCount: agents.length, agents },
			"Agent skill fetched",
		);
	}

	static async create(userId: string, data: AgentSkillCreate) {
		const role = await WorkspaceService.membershipRole(data.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");
		if (!canManage(role)) return fail(403, MANAGE_ONLY);

		const roleKey = roleKeyOf(data.role);
		if (!roleKey) return fail(400, "Role is required");
		if (await this.duplicateRole(data.workspace, roleKey))
			return fail(409, "A skill for this role already exists");

		const skill = await AgentSkill.create({
			...data,
			role: data.role.replace(/\s+/g, " ").trim(),
			roleKey,
			owner: userId,
		});
		const linked = await this.linkUnlinkedAgents(
			skill._id,
			skill.workspace,
			roleKey,
		);
		const agentCount = await this.activeAgentCount(skill._id);
		return ok(
			{ ...skill.toObject(), agentCount, linkedAgents: linked },
			"Agent skill created",
		);
	}

	static async update(id: string, userId: string, data: AgentSkillUpdate) {
		const { skill, role } = await this.accessible(id, userId);
		if (!skill) return fail(404, "Agent skill not found");
		if (!role) return fail(403, "You do not have access to this agent skill");
		if (!canManage(role)) return fail(403, MANAGE_ONLY);

		const roleKey = data.role !== undefined ? roleKeyOf(data.role) : undefined;
		if (roleKey === "") return fail(400, "Role is required");
		const roleChanged = roleKey !== undefined && roleKey !== skill.roleKey;
		if (roleChanged) {
			// Agents are linked by role, so a rename would leave them mismatched.
			const inUse = await this.activeAgentCount(skill._id);
			if (inUse > 0)
				return fail(
					409,
					`${inUse} agent${inUse === 1 ? " uses" : "s use"} this skill. Change their role first, or create a new skill for the new role.`,
				);
			if (await this.duplicateRole(skill.workspace, roleKey, skill._id))
				return fail(409, "A skill for this role already exists");
		}

		Object.assign(skill, data);
		if (data.role !== undefined) {
			skill.role = data.role.replace(/\s+/g, " ").trim();
			skill.roleKey = roleKey as string;
		}
		await skill.save();
		if (roleChanged && !skill.isArchived)
			await this.linkUnlinkedAgents(skill._id, skill.workspace, skill.roleKey);
		const agentCount = await this.activeAgentCount(skill._id);
		return ok({ ...skill.toObject(), agentCount }, "Agent skill updated");
	}

	/** Soft delete. Refused while active agents still use the skill. */
	static async remove(id: string, userId: string) {
		const { skill, role } = await this.accessible(id, userId);
		if (!skill) return fail(404, "Agent skill not found");
		if (!role) return fail(403, "You do not have access to this agent skill");
		if (!canManage(role)) return fail(403, MANAGE_ONLY);

		if (skill.isArchived) return ok(skill, "Agent skill already archived");
		const inUse = await this.activeAgentCount(skill._id);
		if (inUse > 0)
			return fail(
				409,
				`${inUse} agent${inUse === 1 ? " still uses" : "s still use"} this skill. Change their role or archive them first.`,
			);
		skill.isArchived = true;
		await skill.save();
		return ok(skill, "Agent skill archived");
	}
}
