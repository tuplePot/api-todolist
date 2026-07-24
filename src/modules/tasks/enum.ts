import { t } from 'elysia'

// ─── Shared enums (TypeBox) ───────────────────────────────────────────────────

export const statusEnum = t.Union([
  t.Literal('backlog'),
  t.Literal('todo'),
  t.Literal('in_progress'),
  t.Literal('in_review'),
  t.Literal('done'),
  t.Literal('cancelled'),
])
export const priorityEnum = t.Union([
  t.Literal('low'),
  t.Literal('medium'),
  t.Literal('high'),
  t.Literal('urgent'),
])
export const issueTypeEnum = t.Union([
  t.Literal('feature'),
  t.Literal('bug'),
  t.Literal('task'),
  t.Literal('chore'),
])
export const recurrenceTypeEnum = t.Union([
  t.Literal('none'),
  t.Literal('daily'),
  t.Literal('weekly'),
  t.Literal('monthly'),
])