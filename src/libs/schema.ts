import { t } from 'elysia'

// Shared TypeBox helpers reused across modules.

// 24-char hex MongoDB ObjectId, as a string.
export const objectId = t.String({ pattern: '^[0-9a-fA-F]{24}$' })

// `{ id }` route param — e.g. GET /tasks/:id
export const objectIdParam = t.Object({ id: objectId })
