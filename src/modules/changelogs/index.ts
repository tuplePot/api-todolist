import { Elysia } from 'elysia'
import { changelogCreate, changelogUpdate, changelogQuery } from './model'
import { ChangelogService } from './service'
import { guard } from '../../libs/guard'
import { objectIdParam } from '../../libs/schema'

export const changelogsModule = new Elysia({ prefix: '/changelogs' })
  .guard({}, (app) =>
    app
      .use(guard)
      // ── List & Create ──────────────────────────────────────────────────────
      .get('/', ({ user, query }) => ChangelogService.findAll(user.sub, query), {
        query: changelogQuery,
      })
      .post('/', ({ user, body }) => ChangelogService.create(user.sub, body), {
        body: changelogCreate,
      })
      // ── Single entry ───────────────────────────────────────────────────────
      .get('/:id', ({ user, params: { id } }) => ChangelogService.findById(id, user.sub), {
        params: objectIdParam,
      })
      .patch('/:id', ({ user, params: { id }, body }) => ChangelogService.update(id, user.sub, body), {
        params: objectIdParam,
        body: changelogUpdate,
      })
      .delete('/:id', ({ user, params: { id } }) => ChangelogService.remove(id, user.sub), {
        params: objectIdParam,
      })
  )
