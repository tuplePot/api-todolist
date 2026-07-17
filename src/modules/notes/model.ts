import { t } from 'elysia'
import mongoose, { Schema } from 'mongoose'
import type { INote } from './types'
import { objectId } from '../../libs/schema'

// ─── TypeBox schemas ──────────────────────────────────────────────────────────

const colorEnum = t.Union([
  t.Literal('yellow'),
  t.Literal('blue'),
  t.Literal('green'),
  t.Literal('pink'),
  t.Literal('purple'),
])

const nullableColor = t.Union([colorEnum, t.Null()])

export const noteCreate = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  content: t.Optional(t.String({ maxLength: 50000 })),
  tags: t.Optional(t.Array(t.String({ maxLength: 50 }))),
  isPinned: t.Optional(t.Boolean()),
  color: t.Optional(nullableColor),
})

export const noteUpdate = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 255 }),
    content: t.String({ maxLength: 50000 }),
    tags: t.Array(t.String({ maxLength: 50 })),
    isPinned: t.Boolean(),
    color: nullableColor,
  })
)

export const noteQuery = t.Object({
  tags: t.Optional(t.String()),
  isPinned: t.Optional(t.BooleanString()),
  search: t.Optional(t.String()),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
  sortBy: t.Optional(
    t.Union([
      t.Literal('createdAt'),
      t.Literal('updatedAt'),
      t.Literal('title'),
    ])
  ),
  order: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
})

export type NoteCreate = typeof noteCreate.static
export type NoteUpdate = typeof noteUpdate.static
export type NoteQuery = typeof noteQuery.static

// ─── Mongoose model ───────────────────────────────────────────────────────────

const NoteSchema = new Schema<INote>(
  {
    title: { type: String, required: true, maxlength: 255 },
    content: { type: String, default: '', maxlength: 50000 },
    tags: { type: [String], default: [] },
    isPinned: { type: Boolean, default: false },
    color: {
      type: String,
      enum: ['yellow', 'blue', 'green', 'pink', 'purple', null],
      default: null,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

// Queries are always scoped to a single user, so the first index covers everything.
NoteSchema.index({ createdBy: 1, isPinned: -1, updatedAt: -1 })
NoteSchema.index({ createdBy: 1, tags: 1 })
NoteSchema.index({ title: 'text', content: 'text' })

export const Note = mongoose.model<INote>('Note', NoteSchema)

// Re-export for shared reference in objectId param
export { objectId }
