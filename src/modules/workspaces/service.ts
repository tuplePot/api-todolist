import { Types } from 'mongoose'
import { Workspace, type WorkspaceCreate, type AddMemberBody } from './model'
import type { MemberRole } from './types'
import { Task } from '../tasks/schema'
import { ok, fail } from '../../libs/response'

export abstract class WorkspaceService {
  // ─── Membership helpers (reused by TaskService for access control) ───────────

  /** Return the user's role in a workspace, or null if not a member. */
  static async membershipRole(workspaceId: string, userId: string): Promise<MemberRole | null> {
    const ws = await Workspace.findOne(
      { _id: workspaceId, 'members.user': userId },
      { 'members.$': 1 }
    ).lean()
    return ws?.members?.[0]?.role ?? null
  }

  /** All workspace ids the user is a member of — used to scope task listing. */
  static async memberWorkspaceIds(userId: string): Promise<Types.ObjectId[]> {
    const list = await Workspace.find({ 'members.user': userId }, { _id: 1 }).lean()
    return list.map((w) => w._id as Types.ObjectId)
  }

  /**
   * Ensure the user's default personal workspace exists (created lazily since
   * registration happens in the Vault Josh auth service, not here).
   */
  static async ensurePersonal(userId: string) {
    let ws = await Workspace.findOne({ owner: userId, type: 'personal' }).lean()
    if (!ws) {
      const created = await Workspace.create({
        name: 'Personal',
        type: 'personal',
        owner: userId,
        members: [{ user: userId, role: 'owner' }],
      })
      ws = created.toObject()
    }
    return ws
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  static async create(userId: string, data: WorkspaceCreate) {
    const workspace = await Workspace.create({
      name: data.name,
      type: 'team',
      owner: userId,
      members: [{ user: userId, role: 'owner' }],
    })
    return ok(workspace, 'Workspace created')
  }

  static async findAllForUser(userId: string) {
    // Guarantee the personal workspace is present before listing.
    await this.ensurePersonal(userId)
    const workspaces = await Workspace.find({ 'members.user': userId })
      .sort({ type: 1, createdAt: 1 })
      .lean()
    return ok(workspaces, 'Workspaces fetched')
  }

  static async addMember(workspaceId: string, actorId: string, data: AddMemberBody) {
    const workspace = await Workspace.findById(workspaceId)
    if (!workspace) return fail(404, 'Workspace not found')
    if (workspace.type !== 'team') return fail(400, 'Cannot add members to a personal workspace')

    const actor = workspace.members.find((m) => m.user.toString() === actorId)
    if (!actor) return fail(403, 'You are not a member of this workspace')
    if (actor.role !== 'owner' && actor.role !== 'admin')
      return fail(403, 'Only owner or admin can add members')

    if (workspace.members.some((m) => m.user.toString() === data.user))
      return fail(409, 'User is already a member')

    workspace.members.push({ user: new Types.ObjectId(data.user), role: data.role ?? 'member' })
    await workspace.save()
    return ok(workspace, 'Member added')
  }

  static async removeMember(workspaceId: string, actorId: string, targetUserId: string) {
    const workspace = await Workspace.findById(workspaceId)
    if (!workspace) return fail(404, 'Workspace not found')
    if (workspace.type !== 'team') return fail(400, 'Personal workspaces have no members to remove')

    const actor = workspace.members.find((m) => m.user.toString() === actorId)
    if (!actor) return fail(403, 'You are not a member of this workspace')

    const isSelf = actorId === targetUserId
    if (!isSelf && actor.role !== 'owner' && actor.role !== 'admin')
      return fail(403, 'Only owner or admin can remove members')

    const target = workspace.members.find((m) => m.user.toString() === targetUserId)
    if (!target) return fail(404, 'Member not found')
    if (target.role === 'owner') return fail(400, 'The workspace owner cannot be removed')

    workspace.members = workspace.members.filter((m) => m.user.toString() !== targetUserId)
    await workspace.save()
    return ok(workspace, 'Member removed')
  }

  // ─── Dashboard / summary ──────────────────────────────────────────────────────

  static async summary(workspaceId: string, userId: string) {
    const role = await this.membershipRole(workspaceId, userId)
    if (!role) return fail(403, 'You do not have access to this workspace')

    const wsId = new Types.ObjectId(workspaceId)
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [byStatusRaw, overdue, createdLast7, doneLast7] = await Promise.all([
      // count per status (archived excluded)
      Task.aggregate([
        { $match: { workspace: wsId, isArchived: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      // overdue: not done, has a past due date
      Task.countDocuments({
        workspace: wsId,
        isArchived: false,
        status: { $ne: 'done' },
        dueDate: { $ne: null, $lt: now },
      }),
      // completion rate window: tasks created in the last 7 days
      Task.countDocuments({ workspace: wsId, createdAt: { $gte: sevenDaysAgo } }),
      Task.countDocuments({
        workspace: wsId,
        status: 'done',
        updatedAt: { $gte: sevenDaysAgo },
      }),
    ])

    const byStatus = { todo: 0, in_progress: 0, done: 0 }
    for (const row of byStatusRaw) {
      if (row._id in byStatus) byStatus[row._id as keyof typeof byStatus] = row.count
    }

    const total = byStatus.todo + byStatus.in_progress + byStatus.done
    const completionRate7d = createdLast7 === 0 ? 0 : Math.round((doneLast7 / createdLast7) * 1000) / 10

    return ok(
      {
        total,
        byStatus,
        overdue,
        last7Days: { created: createdLast7, done: doneLast7, completionRate: completionRate7d },
      },
      'Workspace summary fetched'
    )
  }
}
