import { t } from 'elysia'
import mongoose, { Schema } from 'mongoose'
import type { IWorkspace } from './types'
import { objectId } from '../../libs/schema'

// ─── TypeBox ─────────────────────────────────────────────────────────────────

const roleEnum = t.Union([t.Literal('owner'), t.Literal('admin'), t.Literal('member')])

// Only team workspaces are created via the API — the personal one is provisioned
// automatically. `type` is therefore not accepted from the client.
export const workspaceCreate = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
})

export const addMemberBody = t.Object({
  user: objectId,
  role: t.Optional(t.Union([t.Literal('admin'), t.Literal('member')])),
})

export type WorkspaceCreate = typeof workspaceCreate.static
export type AddMemberBody = typeof addMemberBody.static

// ─── Mongoose ────────────────────────────────────────────────────────────────

const MemberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  },
  { _id: false }
)

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true, maxlength: 120 },
    type: { type: String, required: true, enum: ['personal', 'team'], default: 'team' },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [MemberSchema], default: [] },
  },
  { timestamps: true }
)

// Fast lookup of "workspaces this user belongs to" (used on every task query).
WorkspaceSchema.index({ 'members.user': 1 })
WorkspaceSchema.index({ owner: 1, type: 1 })

export const Workspace = mongoose.model<IWorkspace>('Workspace', WorkspaceSchema)

// re-export for route validation ergonomics
export { roleEnum }
