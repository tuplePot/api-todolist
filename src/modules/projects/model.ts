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
