import mongoose, { Schema, type Types } from 'mongoose'

export type ActivityAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'assigned'
  | 'unassigned'
  | 'archived'
  | 'checklist_added'
  | 'checklist_updated'
  | 'commented'

export interface IActivityLog {
  task: Types.ObjectId
  user: Types.ObjectId
  action: ActivityAction
  metadata?: Record<string, unknown>
}

// Only createdAt matters for an append-only audit trail — updatedAt is disabled.
const ActivityLogSchema = new Schema<IActivityLog>(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

// Newest-first history per task.
ActivityLogSchema.index({ task: 1, createdAt: -1 })

export const ActivityLog = mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema)
