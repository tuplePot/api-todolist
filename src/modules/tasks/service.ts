import { fail, ok } from "../../libs/response";
// import { Project } from '../projects/model'
import { ActivityService } from "../activity/service";
import { AgentService } from "../agents/service";
import { Project } from "../projects/schema";
import { WorkspaceService } from "../workspaces/service";
import {
	type TaskCreate,
	type TaskQuery,
	type TaskUpdate,
	type TodayQuery,
} from "./model";
import { Task } from "./schema";
import type { TaskStatus } from "./types";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Fields shown for an assigned AI agent on task payloads.
const AGENT_FIELDS = "slug name role color isArchived";

export abstract class TaskService {
	// Fetch a task together with the caller's role in its workspace.
	private static async accessible(taskId: string, userId: string) {
		const task = await Task.findById(taskId);
		if (!task) return { task: null, role: null };
		const role = await WorkspaceService.membershipRole(
			task.workspace.toString(),
			userId,
		);
		return { task, role };
	}

	// Next sequential ticket number within a project.
	private static async nextTicketNumber(projectId: string) {
		const last = await Task.findOne({ project: projectId })
			.sort({ ticketNumber: -1 })
			.select("ticketNumber")
			.lean();
		return (last?.ticketNumber ?? 0) + 1;
	}

	// Every subtask below `id`, at any depth (archived included, so the whole
	// family stays consistent when it moves).
	private static async descendants(id: string) {
		const found = [];
		let frontier = [id];
		while (frontier.length > 0) {
			const children = await Task.find({ parentTask: { $in: frontier } });
			found.push(...children);
			frontier = children.map((c) => c.id as string);
		}
		return found;
	}
	// ─── Create ────────────────────────────────────────────────────────────────

	static async create(userId: string, data: TaskCreate) {
		const role = await WorkspaceService.membershipRole(data.workspace, userId);
		if (!role) return fail(403, "You do not have access to this workspace");

		if (data.assignedTo) {
			const assigneeRole = await WorkspaceService.membershipRole(
				data.workspace,
				data.assignedTo,
			);
			if (!assigneeRole)
				return fail(400, "Assignee is not a member of this workspace");
		}

		if (data.assignedAgent) {
			const agentError = await AgentService.assignableError(
				data.assignedAgent,
				data.workspace,
			);
			if (agentError) return fail(400, agentError);
		}

		let ticketNumber: number | undefined;
		let ticketKey: string | undefined;

		if (data.project) {
			const project = await Project.findById(data.project).lean();
			if (!project) return fail(400, "Project not found");
			if (project.workspace.toString() !== data.workspace)
				return fail(400, "Project belongs to a different workspace");
			if (project.isArchived) return fail(400, "Project is archived");

			ticketNumber = await this.nextTicketNumber(data.project);
			ticketKey = `${project.key}-${ticketNumber}`;
		}

		if (data.parentTask) {
			const parent = await Task.findById(data.parentTask).lean();
			if (!parent) return fail(400, "Parent task not found");
			if (parent.workspace.toString() !== data.workspace)
				return fail(400, "Parent task belongs to a different workspace");
		}

		const task = await Task.create({
			...data,
			createdBy: userId,
			...(ticketNumber !== undefined && { ticketNumber, ticketKey }),
		});
		// Fire-and-forget: the audit write must not hold up the create response.
		// `record` already swallows & logs its own errors, so this never rejects.
		void ActivityService.record(task.id, userId, "created", {
			title: task.title,
		});
		if (task.assignedAgent) {
			void ActivityService.record(task.id, userId, "agent_assigned", {
				from: null,
				to: task.assignedAgent.toString(),
			});
		}
		return ok(task, "Task created");
	}

	// ─── Read ──────────────────────────────────────────────────────────────────

	static async findAll(userId: string, query: TaskQuery) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const filter: Record<string, unknown> = {};

		if (query.project) {
			const project = await Project.findById(query.project).lean();
			if (!project) return fail(404, "Project not found");
			const role = await WorkspaceService.membershipRole(
				project.workspace.toString(),
				userId,
			);
			if (!role) return fail(403, "You do not have access to this project");
			filter.project = query.project;
			// Still scope to the workspace for index efficiency.
			filter.workspace = project.workspace;
		} else if (query.workspace) {
			const role = await WorkspaceService.membershipRole(
				query.workspace,
				userId,
			);
			if (!role) return fail(403, "You do not have access to this workspace");
			filter.workspace = query.workspace;
		} else {
			// Default scope: every workspace the user belongs to.
			filter.workspace = {
				$in: await WorkspaceService.memberWorkspaceIds(userId),
			};
		}

		if (query.status) filter.status = query.status;
		if (query.priority) filter.priority = query.priority;
		if (query.issueType) filter.issueType = query.issueType;
		if (query.tag) filter.tags = query.tag;
		if (query.assignedTo) filter.assignedTo = query.assignedTo;
		if (query.assignedAgent) filter.assignedAgent = query.assignedAgent;
		else if (query.hasAgent) filter.assignedAgent = { $ne: null };
		if (query.parentTask) filter.parentTask = query.parentTask;
		if (!query.includeArchived) filter.isArchived = false;

		if (query.dueBefore || query.dueAfter) {
			const range: Record<string, Date> = {};
			if (query.dueAfter) range.$gte = new Date(query.dueAfter);
			if (query.dueBefore) range.$lte = new Date(query.dueBefore);
			filter.dueDate = range;
		}

		if (query.createdAfter || query.createdBefore) {
			if (query.olderMode && query.createdBefore) {
				// Older board: tasks created before the cutoff, excluding terminal ones
				// that were completed recently (those belong on the active board).
				const cutoff = new Date(query.createdBefore);
				filter.createdAt = { $lte: cutoff };
				filter.status = { $nin: ["done", "cancelled"] };
			} else if (query.activeMode && query.createdAfter) {
				// Active board: ALL tasks created within the last 30 days, any status.
				// A task marked done/cancelled should stay visible here until it ages out.
				filter.createdAt = { $gte: new Date(query.createdAfter) };
			} else {
				const range: Record<string, Date> = {};
				if (query.createdAfter) range.$gte = new Date(query.createdAfter);
				if (query.createdBefore) range.$lte = new Date(query.createdBefore);
				filter.createdAt = range;
			}
		}

		if (query.search) {
			const rx = new RegExp(escapeRegex(query.search), "i");
			filter.$or = [{ title: rx }, { description: rx }];
		}

		const sortBy = query.sortBy ?? "createdAt";
		const order = query.order === "asc" ? 1 : -1;

		const [tasks, total] = await Promise.all([
			Task.find(filter)
				// `_id` is a stable tiebreaker so pagination/board order is deterministic
				// even when many rows share a sort value (e.g. legacy position 0).
				.sort({ [sortBy]: order, _id: 1 })
				.skip((page - 1) * limit)
				.limit(limit)
				.populate("assignedTo", "name email")
				.populate("assignedAgent", AGENT_FIELDS)
				.lean(),
			Task.countDocuments(filter),
		]);

		return ok({ tasks, total, page, limit }, "Tasks fetched");
	}

	static async findById(id: string, userId: string) {
		const { task, role } = await this.accessible(id, userId);
		if (!task) return fail(404, "Task not found");
		if (!role) return fail(403, "You do not have access to this task");

		const [populated, subtasks, activity] = await Promise.all([
			task.populate([
				{ path: "assignedTo", select: "name email" },
				{ path: "assignedAgent", select: AGENT_FIELDS },
				{ path: "createdBy", select: "name email" },
			]),
			Task.find({ parentTask: id, isArchived: false })
				.sort({ createdAt: 1 })
				.lean(),
			ActivityService.listForTask(id, 10),
		]);

		return ok({ ...populated.toObject(), subtasks, activity }, "Task fetched");
	}

	static async listSubtasks(id: string, userId: string) {
		const { task, role } = await this.accessible(id, userId);
		if (!task) return fail(404, "Task not found");
		if (!role) return fail(403, "You do not have access to this task");

		const subtasks = await Task.find({ parentTask: id, isArchived: false })
			.sort({ createdAt: 1 })
			.populate("assignedTo", "name email")
			.populate("assignedAgent", AGENT_FIELDS)
			.lean();
		return ok(subtasks, "Subtasks fetched");
	}

	static async listActivity(id: string, userId: string) {
		const { task, role } = await this.accessible(id, userId);
		if (!task) return fail(404, "Task not found");
		if (!role) return fail(403, "You do not have access to this task");

		const activity = await ActivityService.listForTask(id, 100);
		return ok(activity, "Activity fetched");
	}

	// ─── Update ────────────────────────────────────────────────────────────────

	static async update(id: string, userId: string, body: TaskUpdate) {
		// A project change is more than a field write (ticket re-key, subtasks,
		// possibly a new workspace), so route it through `moveToProject` first.
		const { project, ...data } = body;
		if (project !== undefined) {
			const moved = await this.moveToProject(id, userId, project);
			if (!("success" in moved)) return moved;
		}

		const { task, role } = await this.accessible(id, userId);
		if (!task) return fail(404, "Task not found");
		if (!role) return fail(403, "You do not have access to this task");

		// Validate a new assignee actually belongs to the workspace.
		if (data.assignedTo) {
			const assigneeRole = await WorkspaceService.membershipRole(
				task.workspace.toString(),
				data.assignedTo,
			);
			if (!assigneeRole)
				return fail(400, "Assignee is not a member of this workspace");
		}

		// Validate a new AI agent belongs to the same workspace and is active.
		if (data.assignedAgent) {
			const agentError = await AgentService.assignableError(
				data.assignedAgent,
				task.workspace.toString(),
			);
			if (agentError) return fail(400, agentError);
		}

		const prevAssignee = task.assignedTo?.toString() ?? null;
		const prevAgent = task.assignedAgent?.toString() ?? null;
		const changed: string[] = [];

		for (const [key, value] of Object.entries(data) as [
			keyof TaskUpdate,
			unknown,
		][]) {
			const before = (task as any)[key];
			const beforeCmp =
				before instanceof Date
					? before.toISOString()
					: (before?.toString?.() ?? before);
			const afterCmp = value instanceof Object ? JSON.stringify(value) : value;
			if (JSON.stringify(beforeCmp) !== JSON.stringify(afterCmp))
				changed.push(key as string);
			(task as any)[key] = value;
		}

		await task.save();

		// Assignment changes get their own semantic activity entry.
		if (changed.includes("assignedTo")) {
			const nextAssignee = task.assignedTo?.toString() ?? null;
			await ActivityService.record(
				id,
				userId,
				nextAssignee ? "assigned" : "unassigned",
				{ from: prevAssignee, to: nextAssignee },
			);
		}
		if (changed.includes("assignedAgent")) {
			const nextAgent = task.assignedAgent?.toString() ?? null;
			await ActivityService.record(
				id,
				userId,
				nextAgent ? "agent_assigned" : "agent_unassigned",
				{ from: prevAgent, to: nextAgent },
			);
		}
		const otherChanges = changed.filter(
			(c) => c !== "assignedTo" && c !== "assignedAgent",
		);
		if (otherChanges.length > 0) {
			await ActivityService.record(id, userId, "updated", {
				fields: otherChanges,
			});
		}

		// Return the slim agent so a board card can render it without a refetch.
		await task.populate({ path: "assignedAgent", select: AGENT_FIELDS });
		return ok(task, "Task updated");
	}

	static async updateStatus(id: string, userId: string, status: TaskStatus) {
		const { task, role } = await this.accessible(id, userId);
		if (!task) return fail(404, "Task not found");
		if (!role) return fail(403, "You do not have access to this task");

		const from = task.status;
		if (from === status) return ok(task, "Task status unchanged");

		task.status = status;
		await task.save();
		await ActivityService.record(id, userId, "status_changed", {
			from,
			to: status,
		});
		return ok(task, "Task status updated");
	}

	// Board drag & drop: move to a column at a caller-computed fractional
	// position. One document write, whether reordering in-place or across columns.
	static async move(
		id: string,
		userId: string,
		status: TaskStatus,
		position: number,
	) {
		const { task, role } = await this.accessible(id, userId);
		if (!task) return fail(404, "Task not found");
		if (!role) return fail(403, "You do not have access to this task");

		const from = task.status;
		task.status = status;
		task.position = position;
		await task.save();

		if (from !== status) {
			await ActivityService.record(id, userId, "status_changed", {
				from,
				to: status,
			});
		}
		return ok(task, "Task moved");
	}

	// Move a task (and its subtasks) into another project, or out of any project
	// with `null`. The target may sit in another workspace the caller belongs to;
	// then workspace-bound links (assignee, parent) that would dangle are cleared.
	// Tickets are re-keyed for the target project, e.g. JV-12 → API-40.
	static async moveToProject(
		id: string,
		userId: string,
		projectId: string | null,
	) {
		const { task, role } = await this.accessible(id, userId);
		if (!task) return fail(404, "Task not found");
		if (!role) return fail(403, "You do not have access to this task");

		const fromProject = task.project?.toString() ?? null;
		if (fromProject === projectId) return ok(task, "Task already in project");

		const fromWorkspace = task.workspace.toString();
		let toWorkspace = fromWorkspace;
		let projectKey: string | null = null;

		if (projectId) {
			const project = await Project.findById(projectId).lean();
			if (!project) return fail(404, "Project not found");
			if (project.isArchived) return fail(400, "Project is archived");
			toWorkspace = project.workspace.toString();
			projectKey = project.key;
			if (toWorkspace !== fromWorkspace) {
				const targetRole = await WorkspaceService.membershipRole(
					toWorkspace,
					userId,
				);
				if (!targetRole)
					return fail(403, "You do not have access to the target workspace");
			}
		}

		const crossWorkspace = toWorkspace !== fromWorkspace;
		const family = [task, ...(await this.descendants(id))];

		// Assignees must be members of the destination workspace.
		const memberCache = new Map<string, boolean>();
		const isMember = async (uid: string) => {
			if (!memberCache.has(uid))
				memberCache.set(
					uid,
					!!(await WorkspaceService.membershipRole(toWorkspace, uid)),
				);
			return memberCache.get(uid) as boolean;
		};

		let nextNumber =
			projectId !== null ? await this.nextTicketNumber(projectId) : 0;
		const changes: {
			id: string;
			from: string | null;
			fromKey: string | null;
			toKey: string | null;
		}[] = [];

		for (const t of family) {
			const from = t.project?.toString() ?? null;
			const fromKey = t.ticketKey ?? null;
			t.set("project", projectId);
			if (projectId !== null) {
				t.ticketNumber = nextNumber;
				t.ticketKey = `${projectKey}-${nextNumber}`;
				nextNumber++;
			} else {
				t.set("ticketNumber", null);
				t.set("ticketKey", null);
			}
			if (crossWorkspace) {
				t.set("workspace", toWorkspace);
				const assignee = t.assignedTo?.toString();
				if (assignee && !(await isMember(assignee))) t.set("assignedTo", null);
				// Agents are workspace-scoped, so they never follow a task across.
				t.set("assignedAgent", null);
			}
			changes.push({
				id: t.id as string,
				from,
				fromKey,
				toKey: t.ticketKey ?? null,
			});
		}

		// The moved root's parent stays behind; a cross-workspace link would dangle.
		if (crossWorkspace && task.parentTask) task.set("parentTask", null);

		await Promise.all(family.map((t) => t.save()));

		for (const c of changes) {
			void ActivityService.record(c.id, userId, "project_changed", {
				from: c.from,
				to: projectId,
				fromKey: c.fromKey,
				toKey: c.toKey,
				...(crossWorkspace && { fromWorkspace, toWorkspace }),
			});
		}

		return ok(task, "Task moved to project");
	}

	static async findToday(userId: string, query: TodayQuery) {
		const accessFilter: Record<string, unknown> = {};

		if (query.project) {
			const project = await Project.findById(query.project).lean();
			if (!project) return fail(404, "Project not found");
			const role = await WorkspaceService.membershipRole(
				project.workspace.toString(),
				userId,
			);
			if (!role) return fail(403, "You do not have access to this project");
			accessFilter.project = query.project;
			accessFilter.workspace = project.workspace;
		} else if (query.workspace) {
			const role = await WorkspaceService.membershipRole(
				query.workspace,
				userId,
			);
			if (!role) return fail(403, "You do not have access to this workspace");
			accessFilter.workspace = query.workspace;
		} else {
			accessFilter.workspace = {
				$in: await WorkspaceService.memberWorkspaceIds(userId),
			};
		}

		const now = new Date();
		const todayStart = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
			0,
			0,
			0,
			0,
		);
		const todayEnd = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
			23,
			59,
			59,
			999,
		);

		const base = { ...accessFilter, isArchived: false };
		const populate = [
			{ path: "assignedTo", select: "name email" },
			{ path: "assignedAgent", select: AGENT_FIELDS },
			{ path: "project", select: "name color" },
		];

		const [overdue, today, completed] = await Promise.all([
			Task.find({
				...base,
				dueDate: { $lt: todayStart },
				status: { $nin: ["done", "cancelled"] },
			})
				.sort({ dueDate: 1, _id: 1 })
				.populate(populate)
				.lean(),
			Task.find({
				...base,
				dueDate: { $gte: todayStart, $lte: todayEnd },
				status: { $nin: ["done", "cancelled"] },
			})
				.sort({ position: 1, _id: 1 })
				.populate(populate)
				.lean(),
			// Due today, or overdue but checked off today — otherwise an overdue
			// task vanishes from the view the moment it's completed.
			Task.find({
				...base,
				status: "done",
				$or: [
					{ dueDate: { $gte: todayStart, $lte: todayEnd } },
					{ dueDate: { $lt: todayStart }, updatedAt: { $gte: todayStart } },
				],
			})
				.sort({ updatedAt: -1, _id: 1 })
				.populate(populate)
				.lean(),
		]);

		const counts = {
			total: overdue.length + today.length + completed.length,
			completed: completed.length,
			overdue: overdue.length,
		};

		return ok({ overdue, today, completed, counts }, "Today tasks fetched");
	}

	static async remove(id: string, userId: string) {
		const { task, role } = await this.accessible(id, userId);
		if (!task) return fail(404, "Task not found");
		if (!role) return fail(403, "You do not have access to this task");

		if (task.isArchived) return ok(task, "Task already archived");

		task.isArchived = true;
		await task.save();
		await ActivityService.record(id, userId, "archived");
		return ok(task, "Task archived");
	}

	// ─── Checklist ─────────────────────────────────────────────────────────────

	static async addComment(
		id: string,
		userId: string,
		text: string,
		agentId?: string,
	) {
		const { task, role } = await this.accessible(id, userId);
		if (!task) return fail(404, "Task not found");
		if (!role) return fail(403, "You do not have access to this task");

		if (agentId) {
			const agentError = await AgentService.assignableError(
				agentId,
				task.workspace.toString(),
			);
			if (agentError) return fail(400, agentError);
		}

		await ActivityService.record(id, userId, "commented", {
			text,
			...(agentId && { agentId }),
		});
		return ok({ text, agentId: agentId ?? null }, "Comment added");
	}

	static async addChecklistItem(id: string, userId: string, text: string) {
		const { task, role } = await this.accessible(id, userId);
		if (!task) return fail(404, "Task not found");
		if (!role) return fail(403, "You do not have access to this task");

		task.checklist.push({ text, done: false });
		await task.save();
		await ActivityService.record(id, userId, "checklist_added", { text });
		return ok(task, "Checklist item added");
	}

	static async updateChecklistItem(
		id: string,
		itemId: string,
		userId: string,
		data: { text?: string; done?: boolean },
	) {
		const { task, role } = await this.accessible(id, userId);
		if (!task) return fail(404, "Task not found");
		if (!role) return fail(403, "You do not have access to this task");

		const item = (task.checklist as any).id(itemId);
		if (!item) return fail(404, "Checklist item not found");

		if (data.text !== undefined) item.text = data.text;
		if (data.done !== undefined) item.done = data.done;
		await task.save();
		await ActivityService.record(id, userId, "checklist_updated", {
			itemId,
			...data,
		});
		return ok(task, "Checklist item updated");
	}
}
