import { t } from 'elysia'
import { objectId } from '../../libs/schema'
import { recurrenceTypeEnum, statusEnum, priorityEnum } from './enum'

 

const nullableDate = t.Union([t.String({ format: 'date-time' }), t.Null()])
const recurrenceSchema = t.Object({
  type: recurrenceTypeEnum,
  interval: t.Optional(t.Integer({ minimum: 1 })),
})

// ─── Request schemas ──────────────────────────────────────────────────────────

const nullableIcon = t.Union([t.String({ maxLength: 100 }), t.Null()])
const nullableHexColor = t.Union([
  t.String({ pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', maxLength: 7 }),
  t.Null(),
])

export const taskCreate = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 5000 })),
  status: t.Optional(statusEnum),
  priority: t.Optional(priorityEnum),
  icon: t.Optional(nullableIcon),
  dueDate: t.Optional(nullableDate),
  tags: t.Optional(t.Array(t.String({ maxLength: 50 }))),
  workspace: objectId,
  project: t.Optional(t.Union([objectId, t.Null()])),
  assignedTo: t.Optional(t.Union([objectId, t.Null()])),
  parentTask: t.Optional(t.Union([objectId, t.Null()])),
  checklist: t.Optional(
    t.Array(t.Object({ text: t.String({ minLength: 1 }), done: t.Optional(t.Boolean()) }))
  ),
  recurrence: t.Optional(recurrenceSchema),
  position: t.Optional(t.Number()),
  colorTask: t.Optional(nullableHexColor),
})

export const taskUpdate = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 255 }),
    description: t.String({ maxLength: 5000 }),
    priority: priorityEnum,
    icon: nullableIcon,
    dueDate: nullableDate,
    tags: t.Array(t.String({ maxLength: 50 })),
    project: t.Union([objectId, t.Null()]),
    assignedTo: t.Union([objectId, t.Null()]),
    parentTask: t.Union([objectId, t.Null()]),
    recurrence: recurrenceSchema,
    colorTask: nullableHexColor,
  })
)

export const statusBody = t.Object({ status: statusEnum })

export const moveBody = t.Object({ status: statusEnum, position: t.Number() })

export const checklistAddBody = t.Object({ text: t.String({ minLength: 1, maxLength: 500 }) })
export const checklistUpdateBody = t.Partial(
  t.Object({ text: t.String({ minLength: 1, maxLength: 500 }), done: t.Boolean() })
)

export const taskQuery = t.Object({
  workspace: t.Optional(objectId),
  project: t.Optional(objectId),
  status: t.Optional(statusEnum),
  priority: t.Optional(priorityEnum),
  tag: t.Optional(t.String()),
  assignedTo: t.Optional(objectId),
  dueBefore: t.Optional(t.String({ format: 'date-time' })),
  dueAfter: t.Optional(t.String({ format: 'date-time' })),
  search: t.Optional(t.String()),
  parentTask: t.Optional(objectId),
  includeArchived: t.Optional(t.BooleanString()),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
  sortBy: t.Optional(
    t.Union([
      t.Literal('createdAt'),
      t.Literal('updatedAt'),
      t.Literal('dueDate'),
      t.Literal('priority'),
      t.Literal('title'),
      t.Literal('position'),
    ])
  ),
  order: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
})

export type TaskCreate = typeof taskCreate.static
export type TaskUpdate = typeof taskUpdate.static
export type StatusBody = typeof statusBody.static
export type MoveBody = typeof moveBody.static
export type ChecklistAddBody = typeof checklistAddBody.static
export type ChecklistUpdateBody = typeof checklistUpdateBody.static
export type TaskQuery = typeof taskQuery.static
