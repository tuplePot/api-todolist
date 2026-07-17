import { Task, type TaskCreate, type TaskUpdate, type TaskQuery } from './model'
import type { TaskStatus } from './types'
import { WorkspaceService } from '../workspaces/service'
import { Project } from '../projects/model'
import { ActivityService } from '../activity/service'
import { ok, fail } from '../../libs/response'

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export abstract class TaskService {
  // Fetch a task together with the caller's role in its workspace.
  private static async accessible(taskId: string, userId: string) {
    const task = await Task.findById(taskId)
    if (!task) return { task: null, role: null }
    const role = await WorkspaceService.membershipRole(task.workspace.toString(), userId)
    return { task, role }
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  static async create(userId: string, data: TaskCreate) {
    const role = await WorkspaceService.membershipRole(data.workspace, userId)
    if (!role) return fail(403, 'You do not have access to this workspace')

    if (data.assignedTo) {
      const assigneeRole = await WorkspaceService.membershipRole(data.workspace, data.assignedTo)
      if (!assigneeRole) return fail(400, 'Assignee is not a member of this workspace')
    }

    if (data.project) {
      const project = await Project.findById(data.project).lean()
      if (!project) return fail(400, 'Project not found')
      if (project.workspace.toString() !== data.workspace)
        return fail(400, 'Project belongs to a different workspace')
      if (project.isArchived) return fail(400, 'Project is archived')
    }

    if (data.parentTask) {
      const parent = await Task.findById(data.parentTask).lean()
      if (!parent) return fail(400, 'Parent task not found')
      if (parent.workspace.toString() !== data.workspace)
        return fail(400, 'Parent task belongs to a different workspace')
    }

    const task = await Task.create({ ...data, createdBy: userId })
    await ActivityService.record(task.id, userId, 'created', { title: task.title })
    return ok(task, 'Task created')
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  static async findAll(userId: string, query: TaskQuery) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const filter: Record<string, unknown> = {}

    if (query.project) {
      const project = await Project.findById(query.project).lean()
      if (!project) return fail(404, 'Project not found')
      const role = await WorkspaceService.membershipRole(project.workspace.toString(), userId)
      if (!role) return fail(403, 'You do not have access to this project')
      filter.project = query.project
      // Still scope to the workspace for index efficiency.
      filter.workspace = project.workspace
    } else if (query.workspace) {
      const role = await WorkspaceService.membershipRole(query.workspace, userId)
      if (!role) return fail(403, 'You do not have access to this workspace')
      filter.workspace = query.workspace
    } else {
      // Default scope: every workspace the user belongs to.
      filter.workspace = { $in: await WorkspaceService.memberWorkspaceIds(userId) }
    }

    if (query.status) filter.status = query.status
    if (query.priority) filter.priority = query.priority
    if (query.tag) filter.tags = query.tag
    if (query.assignedTo) filter.assignedTo = query.assignedTo
    if (query.parentTask) filter.parentTask = query.parentTask
    if (!query.includeArchived) filter.isArchived = false

    if (query.dueBefore || query.dueAfter) {
      const range: Record<string, Date> = {}
      if (query.dueAfter) range.$gte = new Date(query.dueAfter)
      if (query.dueBefore) range.$lte = new Date(query.dueBefore)
      filter.dueDate = range
    }

    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i')
      filter.$or = [{ title: rx }, { description: rx }]
    }

    const sortBy = query.sortBy ?? 'createdAt'
    const order = query.order === 'asc' ? 1 : -1

    const [tasks, total] = await Promise.all([
      Task.find(filter)
        // `_id` is a stable tiebreaker so pagination/board order is deterministic
        // even when many rows share a sort value (e.g. legacy position 0).
        .sort({ [sortBy]: order, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('assignedTo', 'name email')
        .lean(),
      Task.countDocuments(filter),
    ])

    return ok({ tasks, total, page, limit }, 'Tasks fetched')
  }

  static async findById(id: string, userId: string) {
    const { task, role } = await this.accessible(id, userId)
    if (!task) return fail(404, 'Task not found')
    if (!role) return fail(403, 'You do not have access to this task')

    const [populated, subtasks, activity] = await Promise.all([
      task.populate([
        { path: 'assignedTo', select: 'name email' },
        { path: 'createdBy', select: 'name email' },
      ]),
      Task.find({ parentTask: id, isArchived: false }).sort({ createdAt: 1 }).lean(),
      ActivityService.listForTask(id, 10),
    ])

    return ok({ ...populated.toObject(), subtasks, activity }, 'Task fetched')
  }

  static async listSubtasks(id: string, userId: string) {
    const { task, role } = await this.accessible(id, userId)
    if (!task) return fail(404, 'Task not found')
    if (!role) return fail(403, 'You do not have access to this task')

    const subtasks = await Task.find({ parentTask: id, isArchived: false })
      .sort({ createdAt: 1 })
      .populate('assignedTo', 'name email')
      .lean()
    return ok(subtasks, 'Subtasks fetched')
  }

  static async listActivity(id: string, userId: string) {
    const { task, role } = await this.accessible(id, userId)
    if (!task) return fail(404, 'Task not found')
    if (!role) return fail(403, 'You do not have access to this task')

    const activity = await ActivityService.listForTask(id, 100)
    return ok(activity, 'Activity fetched')
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  static async update(id: string, userId: string, data: TaskUpdate) {
    const { task, role } = await this.accessible(id, userId)
    if (!task) return fail(404, 'Task not found')
    if (!role) return fail(403, 'You do not have access to this task')

    // Validate a new assignee actually belongs to the workspace.
    if (data.assignedTo) {
      const assigneeRole = await WorkspaceService.membershipRole(
        task.workspace.toString(),
        data.assignedTo
      )
      if (!assigneeRole) return fail(400, 'Assignee is not a member of this workspace')
    }

    const prevAssignee = task.assignedTo?.toString() ?? null
    const changed: string[] = []

    for (const [key, value] of Object.entries(data) as [keyof TaskUpdate, unknown][]) {
      const before = (task as any)[key]
      const beforeCmp = before instanceof Date ? before.toISOString() : before?.toString?.() ?? before
      const afterCmp = value instanceof Object ? JSON.stringify(value) : value
      if (JSON.stringify(beforeCmp) !== JSON.stringify(afterCmp)) changed.push(key as string)
      ;(task as any)[key] = value
    }

    await task.save()

    // Assignment changes get their own semantic activity entry.
    if (changed.includes('assignedTo')) {
      const nextAssignee = task.assignedTo?.toString() ?? null
      await ActivityService.record(
        id,
        userId,
        nextAssignee ? 'assigned' : 'unassigned',
        { from: prevAssignee, to: nextAssignee }
      )
    }
    const otherChanges = changed.filter((c) => c !== 'assignedTo')
    if (otherChanges.length > 0) {
      await ActivityService.record(id, userId, 'updated', { fields: otherChanges })
    }

    return ok(task, 'Task updated')
  }

  static async updateStatus(id: string, userId: string, status: TaskStatus) {
    const { task, role } = await this.accessible(id, userId)
    if (!task) return fail(404, 'Task not found')
    if (!role) return fail(403, 'You do not have access to this task')

    const from = task.status
    if (from === status) return ok(task, 'Task status unchanged')

    task.status = status
    await task.save()
    await ActivityService.record(id, userId, 'status_changed', { from, to: status })
    return ok(task, 'Task status updated')
  }

  // Board drag & drop: move to a column at a caller-computed fractional
  // position. One document write, whether reordering in-place or across columns.
  static async move(id: string, userId: string, status: TaskStatus, position: number) {
    const { task, role } = await this.accessible(id, userId)
    if (!task) return fail(404, 'Task not found')
    if (!role) return fail(403, 'You do not have access to this task')

    const from = task.status
    task.status = status
    task.position = position
    await task.save()

    if (from !== status) {
      await ActivityService.record(id, userId, 'status_changed', { from, to: status })
    }
    return ok(task, 'Task moved')
  }

  static async remove(id: string, userId: string) {
    const { task, role } = await this.accessible(id, userId)
    if (!task) return fail(404, 'Task not found')
    if (!role) return fail(403, 'You do not have access to this task')

    if (task.isArchived) return ok(task, 'Task already archived')

    task.isArchived = true
    await task.save()
    await ActivityService.record(id, userId, 'archived')
    return ok(task, 'Task archived')
  }

  // ─── Checklist ─────────────────────────────────────────────────────────────

  static async addChecklistItem(id: string, userId: string, text: string) {
    const { task, role } = await this.accessible(id, userId)
    if (!task) return fail(404, 'Task not found')
    if (!role) return fail(403, 'You do not have access to this task')

    task.checklist.push({ text, done: false })
    await task.save()
    await ActivityService.record(id, userId, 'checklist_added', { text })
    return ok(task, 'Checklist item added')
  }

  static async updateChecklistItem(
    id: string,
    itemId: string,
    userId: string,
    data: { text?: string; done?: boolean }
  ) {
    const { task, role } = await this.accessible(id, userId)
    if (!task) return fail(404, 'Task not found')
    if (!role) return fail(403, 'You do not have access to this task')

    const item = (task.checklist as any).id(itemId)
    if (!item) return fail(404, 'Checklist item not found')

    if (data.text !== undefined) item.text = data.text
    if (data.done !== undefined) item.done = data.done
    await task.save()
    await ActivityService.record(id, userId, 'checklist_updated', { itemId, ...data })
    return ok(task, 'Checklist item updated')
  }
}
