import { Elysia } from 'elysia'
import { noteCreate, noteUpdate, noteQuery } from './model'
import { NoteService } from './service'
import { guard } from '../../libs/guard'
import { objectIdParam } from '../../libs/schema'

export const notesModule = new Elysia({ prefix: '/notes' })
  .guard({}, (app) =>
    app
      .use(guard)
      // ── List & Create ──────────────────────────────────────────────────────
      .get('/', ({ user, query }) => NoteService.findAll(user.sub, query), { query: noteQuery })
      .post('/', ({ user, body }) => NoteService.create(user.sub, body), { body: noteCreate })
      // ── Single note ────────────────────────────────────────────────────────
      .get('/:id', ({ user, params: { id } }) => NoteService.findById(id, user.sub), {
        params: objectIdParam,
      })
      .patch('/:id', ({ user, params: { id }, body }) => NoteService.update(id, user.sub, body), {
        params: objectIdParam,
        body: noteUpdate,
      })
      .delete('/:id', ({ user, params: { id } }) => NoteService.remove(id, user.sub), {
        params: objectIdParam,
      })
      // ── Toggle pin ─────────────────────────────────────────────────────────
      .patch('/:id/toggle-pin', ({ user, params: { id } }) => NoteService.togglePin(id, user.sub), {
        params: objectIdParam,
      })
  )
