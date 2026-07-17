import { t } from 'elysia'
import mongoose, { Schema } from 'mongoose'
import type { IProject } from './types'
import { objectId } from '../../libs/schema'

// ─── TypeBox schemas ──────────────────────────────────────────────────────────

export const projectCreate = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  color: t.Optional(t.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
  workspace: objectId,
})

export const projectUpdate = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 120 }),
    description: t.String({ maxLength: 1000 }),
    color: t.Union([t.String({ pattern: '^#[0-9a-fA-F]{6}$' }), t.Null()]),
  })
)

export const projectQuery = t.Object({
  workspace: objectId,
  includeArchived: t.Optional(t.BooleanString()),
})

export type ProjectCreate = typeof projectCreate.static
export type ProjectUpdate = typeof projectUpdate.static
export type ProjectQuery = typeof projectQuery.static

// ─── Mongoose ────────────────────────────────────────────────────────────────

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 1000 },
    color: { type: String },
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
)

ProjectSchema.index({ workspace: 1, isArchived: 1 })
ProjectSchema.index({ owner: 1 })

export const Project = mongoose.model<IProject>('Project', ProjectSchema)
