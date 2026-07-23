import mongoose, { Schema } from 'mongoose'
import type { ITask } from './types'

const ChecklistItemSchema = new Schema(
  {
    text: { type: String, required: true, maxlength: 500 },
    done: { type: Boolean, default: false },
  },
  { _id: true }
)

const TaskSchema = new Schema<ITask>(
  {
    title: { type: String, required: true, maxlength: 255 },
    description: { type: String, maxlength: 5000 },
    status: { type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    icon: { type: String, default: null },
    dueDate: { type: Date, default: null },
    tags: { type: [String], default: [] },
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    parentTask: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    checklist: { type: [ChecklistItemSchema], default: [] },
    recurrence: {
      type: {
        type: String,
        enum: ['none', 'daily', 'weekly', 'monthly'],
        default: 'none',
      },
      interval: { type: Number, default: 1, min: 1 },
    },
    isArchived: { type: Boolean, default: false },
    position: { type: Number, default: () => Date.now() },
    colorTask: { type: String, default: null, maxlength: 7 },
  },
  { timestamps: true }
)

TaskSchema.index({ workspace: 1, status: 1 })
TaskSchema.index({ workspace: 1, status: 1, position: 1 })
TaskSchema.index({ workspace: 1, isArchived: 1 })
TaskSchema.index({ project: 1, status: 1 })
TaskSchema.index({ project: 1, isArchived: 1 })
TaskSchema.index({ assignedTo: 1 })
TaskSchema.index({ dueDate: 1 })
TaskSchema.index({ parentTask: 1 })
TaskSchema.index({ title: 'text', description: 'text' })

export const Task = mongoose.model<ITask>('Task', TaskSchema)
