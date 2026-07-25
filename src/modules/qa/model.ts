import { t } from 'elysia'
import mongoose, { Schema } from 'mongoose'
import type { IQA } from './types'
import { objectId } from '../../libs/schema'

// ─── TypeBox schemas ──────────────────────────────────────────────────────────

export const qaCreate = t.Object({
  question: t.String({ minLength: 1, maxLength: 1000 }),
  answer: t.String({ minLength: 1, maxLength: 50000 }),
  tags: t.Optional(t.Array(t.String({ maxLength: 50 }))),
  source: t.Optional(t.String({ maxLength: 255 })),
  isPinned: t.Optional(t.Boolean()),
})

export const qaUpdate = t.Partial(
  t.Object({
    question: t.String({ minLength: 1, maxLength: 1000 }),
    answer: t.String({ minLength: 1, maxLength: 50000 }),
    tags: t.Array(t.String({ maxLength: 50 })),
    source: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    isPinned: t.Boolean(),
  })
)

export const qaQuery = t.Object({
  tags: t.Optional(t.String()),
  isPinned: t.Optional(t.BooleanString()),
  search: t.Optional(t.String()),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
  sortBy: t.Optional(t.Union([t.Literal('createdAt'), t.Literal('updatedAt')])),
  order: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
})

export type QACreate = typeof qaCreate.static
export type QAUpdate = typeof qaUpdate.static
export type QAQuery = typeof qaQuery.static

// ─── Mongoose model ───────────────────────────────────────────────────────────

const QASchema = new Schema<IQA>(
  {
    question: { type: String, required: true, maxlength: 1000 },
    answer: { type: String, required: true, maxlength: 50000 },
    tags: { type: [String], default: [] },
    source: { type: String, default: '' },
    isPinned: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

QASchema.index({ createdBy: 1, isPinned: -1, updatedAt: -1 })
QASchema.index({ createdBy: 1, tags: 1 })
QASchema.index({ question: 'text', answer: 'text' })

export const QA = mongoose.model<IQA>('QA', QASchema)

export { objectId }
