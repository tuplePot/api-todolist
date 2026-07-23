import { t } from 'elysia'

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