import { t } from 'elysia'
import mongoose, { Schema } from 'mongoose'
import type { IGlossaryEntry, ConfidenceLevel } from './types'

const confidenceEnum = t.Union([t.Literal('new'), t.Literal('learning'), t.Literal('known')])

export const glossaryCreate = t.Object({
  term: t.String({ minLength: 1, maxLength: 255 }),
  definition: t.String({ minLength: 1 }),
  color: t.Optional(t.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
  category: t.Optional(t.String({ maxLength: 100 })),
  sourceNote: t.Optional(t.String({ maxLength: 1000 })),
  confidence: t.Optional(confidenceEnum),
})

export const glossaryUpdate = t.Partial(
  t.Object({
    term: t.String({ minLength: 1, maxLength: 255 }),
    definition: t.String({ minLength: 1 }),
    color: t.String({ pattern: '^#[0-9a-fA-F]{6}$' }),
    category: t.String({ maxLength: 100 }),
    sourceNote: t.String({ maxLength: 1000 }),
    confidence: confidenceEnum,
  })
)
// test  
export const glossaryQuery = t.Object({
  search: t.Optional(t.String()),
  category: t.Optional(t.String({ maxLength: 100 })),
  confidence: t.Optional(confidenceEnum),
  sort: t.Optional(t.Union([t.Literal('az'), t.Literal('newest'), t.Literal('oldest')])),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
})

export type GlossaryCreate = typeof glossaryCreate.static
export type GlossaryUpdate = typeof glossaryUpdate.static
export type GlossaryQuery = typeof glossaryQuery.static

// ─── Mongoose model ───────────────────────────────────────────

const GlossaryEntrySchema = new Schema<IGlossaryEntry>(
  {
    term: { type: String, required: true, trim: true, maxlength: 255 },
    definition: { type: String, required: true },
    category: { type: String, maxlength: 100 },
    sourceNote: { type: String, maxlength: 1000 },
    color: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
    confidence: {
      type: String,
      enum: ['new', 'learning', 'known'] satisfies ConfidenceLevel[],
      default: 'new',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

GlossaryEntrySchema.index({ createdBy: 1, confidence: 1 })
GlossaryEntrySchema.index({ createdBy: 1, category: 1 })
GlossaryEntrySchema.index({ createdBy: 1, color: 1 })
GlossaryEntrySchema.index({ term: 'text', definition: 'text' })

export const GlossaryEntry = mongoose.model<IGlossaryEntry>('GlossaryEntry', GlossaryEntrySchema)
