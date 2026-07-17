import { ActivityLog, type ActivityAction } from './model'
import { log } from '../../libs/logger'

// Audit-trail writer. Invoked from TaskService (never from route handlers) so
// business events are logged in one place. Failures are swallowed & logged —
// an audit write must never break the primary operation.
export abstract class ActivityService {
  static async record(
    taskId: string,
    userId: string,
    action: ActivityAction,
    metadata?: Record<string, unknown>
  ) {
    try {
      await ActivityLog.create({ task: taskId, user: userId, action, metadata })
    } catch (err) {
      log.error({ err, taskId, action }, 'Failed to write activity log')
    }
  }

  static async listForTask(taskId: string, limit = 50) {
    return ActivityLog.find({ task: taskId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user', 'name email')
      .lean()
  }
}
