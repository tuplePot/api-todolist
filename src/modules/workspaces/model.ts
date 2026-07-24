import { t } from 'elysia'
import mongoose, { Schema } from 'mongoose'
import type { IWorkspace } from './types'
import { objectId } from '../../libs/schema'

// ─── TypeBox ─────────────────────────────────────────────────────────────────

const roleEnum = t.Union([t.Literal('owner'), t.Literal('admin'), t.Literal('member')])

const boardStatusIdEnum = t.Union([
  t.Literal('backlog'),
  t.Literal('todo'),
  t.Literal('in_progress'),
  t.Literal('in_review'),
  t.Literal('done'),
  t.Literal('cancelled'),
])

const statusConfigEntry = t.Object({
  id: boardStatusIdEnum,
  label: t.String(),
  enabled: t.Boolean(),
  position: t.Number(),
})

// Only team workspaces are created via the API — the personal one is provisioned
// automatically. `type` is therefore not accepted from the client.
export const workspaceCreate = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
})

export const addMemberBody = t.Object({
  user: objectId,
  role: t.Optional(t.Union([t.Literal('admin'), t.Literal('member')])),
})

export const statusConfigBody = t.Object({
  statuses: t.Array(statusConfigEntry, { minItems: 1, maxItems: 10 }),
})

export type WorkspaceCreate = typeof workspaceCreate.static
export type AddMemberBody = typeof addMemberBody.static
export type StatusConfigBody = typeof statusConfigBody.static

// ─── Mongoose ────────────────────────────────────────────────────────────────

const MemberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  },
  { _id: false }
)

const StatusEntrySchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'],
    },
    label: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    position: { type: Number, required: true },
  },
  { _id: false }
)

const DEFAULT_STATUS_CONFIG = [
  { id: 'backlog', label: 'Backlog', enabled: true, position: 0 },
  { id: 'todo', label: 'Todo', enabled: true, position: 1 },
  { id: 'in_progress', label: 'In Progress', enabled: true, position: 2 },
  { id: 'in_review', label: 'In Review', enabled: true, position: 3 },
  { id: 'done', label: 'Done', enabled: true, position: 4 },
  { id: 'cancelled', label: 'Cancelled', enabled: true, position: 5 },
]

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true, maxlength: 120 },
    type: { type: String, required: true, enum: ['personal', 'team'], default: 'team' },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [MemberSchema], default: [] },
    statusConfig: { type: [StatusEntrySchema], default: DEFAULT_STATUS_CONFIG } as any,
  },
  { timestamps: true }
)

// Fast lookup of "workspaces this user belongs to" (used on every task query).
WorkspaceSchema.index({ 'members.user': 1 })
WorkspaceSchema.index({ owner: 1, type: 1 })

export const Workspace = mongoose.model<IWorkspace>('Workspace', WorkspaceSchema)

// re-export for route validation ergonomics
export { roleEnum }
