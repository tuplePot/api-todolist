import { Elysia } from 'elysia'
import { qaCreate, qaUpdate, qaQuery } from './model'
import { QAService } from './service'
import { guard } from '../../libs/guard'
import { objectIdParam } from '../../libs/schema'

export const qaModule = new Elysia({ prefix: '/qa' })
  .guard({}, (app) =>
    app
      .use(guard)
      // ── List & Create ──────────────────────────────────────────────────────
      .get('/', ({ user, query }) => QAService.findAll(user.sub, query), { query: qaQuery })
      .post('/', ({ user, body }) => QAService.create(user.sub, body), { body: qaCreate })
      // ── Single Q&A ─────────────────────────────────────────────────────────
      .get('/:id', ({ user, params: { id } }) => QAService.findById(id, user.sub), {
        params: objectIdParam,
      })
      .patch('/:id', ({ user, params: { id }, body }) => QAService.update(id, user.sub, body), {
        params: objectIdParam,
        body: qaUpdate,
      })
      .delete('/:id', ({ user, params: { id } }) => QAService.remove(id, user.sub), {
        params: objectIdParam,
      })
      // ── Toggle pin ─────────────────────────────────────────────────────────
      .patch('/:id/toggle-pin', ({ user, params: { id } }) => QAService.togglePin(id, user.sub), {
        params: objectIdParam,
      })
  )
