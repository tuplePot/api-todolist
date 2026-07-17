import { Elysia, status } from 'elysia'
import { jwt as jwtPlugin } from '@elysiajs/jwt'
import { Types } from 'mongoose'

// Reusable JWT auth guard. Assumes Vault Josh's auth service issues an HS256
// token whose payload carries `sub` (userId), `email`, and `role`. Attach with
// `.use(guard)` inside a `.guard({}, ...)` block; downstream handlers then read
// `ctx.user`.
export const guard = new Elysia({ name: 'guard' })
  .use(
    jwtPlugin({
      name: 'jwt',
      secret: process.env.JWT_SECRET!,
      exp: '7d',
    })
  )
  .resolve({ as: 'scoped' }, async ({ jwt, headers }) => {
    // 1) API-key bypass: a valid `x-api-key` grants access without a login token
    // (used by trusted service-to-service callers like Vault Josh). The key acts
    // AS a real user, since every downstream query keys off `user.sub` as a Mongo
    // ObjectId (workspace.owner, members.user, task scoping). The acting user is
    // `API_USER_ID` by default, overridable per-request via the `x-user-id` header.
    const apiKey = headers['x-api-key']
    if (apiKey && process.env.API_KEY && apiKey === process.env.API_KEY) {
      const actingId = headers['x-user-id'] || process.env.API_USER_ID
      if (!actingId || !Types.ObjectId.isValid(actingId))
        return status(401, {
          success: false,
          message: 'API key valid but no usable user id (set API_USER_ID or send x-user-id)',
          data: null,
        })

      return {
        user: { sub: actingId, email: 'service@api-key', role: 'service' } as {
          sub: string
          email: string
          role?: string
        },
      }
    }

    // 2) JWT auth via `Authorization: Bearer <token>`.
    const auth = headers['authorization']
    if (!auth || !auth.startsWith('Bearer '))
      return status(401, { success: false, message: 'Unauthorized', data: null })

    const payload = await jwt.verify(auth.slice(7))
    if (!payload)
      return status(401, { success: false, message: 'Invalid or expired token', data: null })

    return { user: payload as { sub: string; email: string; role?: string } }
  })
