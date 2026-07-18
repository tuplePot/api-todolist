import { t } from 'elysia'
import mongoose, { Schema } from 'mongoose'
import type { ITask } from './types'
import { objectId } from '../../libs/schema'

// ─── Shared enums (TypeBox) ───────────────────────────────────────────────────

export const statusEnum = t.Union([
  t.Literal('todo'),
  t.Literal('in_progress'),
  t.Literal('done'),
])
export const priorityEnum = t.Union([
  t.Literal('low'),
  t.Literal('medium'),
  t.Literal('high'),
  t.Literal('urgent'),
])
export const recurrenceTypeEnum = t.Union([
  t.Literal('none'),
  t.Literal('daily'),
  t.Literal('weekly'),
  t.Literal('monthly'),
])

const nullableDate = t.Union([t.String({ format: 'date-time' }), t.Null()])
const recurrenceSchema = t.Object({
  type: recurrenceTypeEnum,
  interval: t.Optional(t.Integer({ minimum: 1 })),
})

// ─── Request schemas ──────────────────────────────────────────────────────────

const nullableIcon = t.Union([t.String({ maxLength: 100 }), t.Null()])

export const taskCreate = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 5000 })),
  status: t.Optional(statusEnum),
  priority: t.Optional(priorityEnum),
  icon: t.Optional(nullableIcon),
  dueDate: t.Optional(nullableDate),
  tags: t.Optional(t.Array(t.String({ maxLength: 50 }))),
  workspace: objectId,
  project: t.Optional(t.Union([objectId, t.Null()])),
  assignedTo: t.Optional(t.Union([objectId, t.Null()])),
  parentTask: t.Optional(t.Union([objectId, t.Null()])),
  checklist: t.Optional(
    t.Array(t.Object({ text: t.String({ minLength: 1 }), done: t.Optional(t.Boolean()) }))
  ),
  recurrence: t.Optional(recurrenceSchema),
  position: t.Optional(t.Number()),
})

export const taskUpdate = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 255 }),
    description: t.String({ maxLength: 5000 }),
    priority: priorityEnum,
    icon: nullableIcon,
    dueDate: nullableDate,
    tags: t.Array(t.String({ maxLength: 50 })),
    project: t.Union([objectId, t.Null()]),
    assignedTo: t.Union([objectId, t.Null()]),
    parentTask: t.Union([objectId, t.Null()]),
    recurrence: recurrenceSchema,
  })
)

export const statusBody = t.Object({ status: statusEnum })

// Board move: set the column (status) and the fractional sort key together.
export const moveBody = t.Object({ status: statusEnum, position: t.Number() })

export const checklistAddBody = t.Object({ text: t.String({ minLength: 1, maxLength: 500 }) })
export const checklistUpdateBody = t.Partial(
  t.Object({ text: t.String({ minLength: 1, maxLength: 500 }), done: t.Boolean() })
)

export const taskQuery = t.Object({
  workspace: t.Optional(objectId),
  project: t.Optional(objectId),
  status: t.Optional(statusEnum),
  priority: t.Optional(priorityEnum),
  tag: t.Optional(t.String()),
  assignedTo: t.Optional(objectId),
  dueBefore: t.Optional(t.String({ format: 'date-time' })),
  dueAfter: t.Optional(t.String({ format: 'date-time' })),
  search: t.Optional(t.String()),
  parentTask: t.Optional(objectId),
  includeArchived: t.Optional(t.BooleanString()),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
  sortBy: t.Optional(
    t.Union([
      t.Literal('createdAt'),
      t.Literal('updatedAt'),
      t.Literal('dueDate'),
      t.Literal('priority'),
      t.Literal('title'),
      t.Literal('position'),
    ])
  ),
  order: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
})

export type TaskCreate = typeof taskCreate.static
export type TaskUpdate = typeof taskUpdate.static
export type StatusBody = typeof statusBody.static
export type MoveBody = typeof moveBody.static
export type ChecklistAddBody = typeof checklistAddBody.static
export type ChecklistUpdateBody = typeof checklistUpdateBody.static
export type TaskQuery = typeof taskQuery.static

// ─── Mongoose ────────────────────────────────────────────────────────────────

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
  },
  { timestamps: true }
)

// Indexes on the hot query paths (listing, filtering, dashboards).
TaskSchema.index({ workspace: 1, status: 1 })
// Board: fetch a column already ordered without an in-memory sort.
TaskSchema.index({ workspace: 1, status: 1, position: 1 })
TaskSchema.index({ workspace: 1, isArchived: 1 })
TaskSchema.index({ project: 1, status: 1 })
TaskSchema.index({ project: 1, isArchived: 1 })
TaskSchema.index({ assignedTo: 1 })
TaskSchema.index({ dueDate: 1 })
TaskSchema.index({ parentTask: 1 })
TaskSchema.index({ title: 'text', description: 'text' })

export const Task = mongoose.model<ITask>('Task', TaskSchema)
