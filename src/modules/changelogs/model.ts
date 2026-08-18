import { t } from 'elysia'
import mongoose, { Schema } from 'mongoose'
import type { IChangelog } from './types'
import { objectId } from '../../libs/schema'

// ─── TypeBox schemas ──────────────────────────────────────────────────────────

export const changelogCreate = t.Object({
  version: t.String({ minLength: 1, maxLength: 30 }),
  content: t.String({ minLength: 1, maxLength: 20000 }),
  project: objectId,
  releasedAt: t.Optional(t.Union([t.String(), t.Null()])),
})

export const changelogUpdate = t.Partial(
  t.Object({
    version: t.String({ minLength: 1, maxLength: 30 }),
    content: t.String({ maxLength: 20000 }),
    releasedAt: t.Union([t.String(), t.Null()]),
  })
)

export const changelogQuery = t.Object({
  project: objectId,
})

export type ChangelogCreate = typeof changelogCreate.static
export type ChangelogUpdate = typeof changelogUpdate.static
export type ChangelogQuery = typeof changelogQuery.static

// ─── Mongoose model ───────────────────────────────────────────────────────────

const ChangelogSchema = new Schema<IChangelog>(
  {
    version: { type: String, required: true, maxlength: 30 },
    content: { type: String, required: true, maxlength: 20000 },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    releasedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

ChangelogSchema.index({ project: 1, createdAt: -1 })
ChangelogSchema.index({ project: 1, version: 1 }, { unique: true })

export const Changelog = mongoose.model<IChangelog>('Changelog', ChangelogSchema)
