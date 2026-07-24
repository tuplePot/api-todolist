import { Elysia } from 'elysia'
import { glossaryCreate, glossaryUpdate, glossaryQuery } from './model'
import { GlossaryService } from './service'
import { guard } from '../../libs/guard'
import { objectIdParam } from '../../libs/schema'

export const glossaryModule = new Elysia({ prefix: '/glossary' })
  .guard({}, (app) =>
    app
      .use(guard)
      .get('/', ({ user, query }) => GlossaryService.findAll(user.sub, query), { query: glossaryQuery })
      .post('/', ({ user, body }) => GlossaryService.create(user.sub, body), { body: glossaryCreate })
      .get('/:id', ({ user, params: { id } }) => GlossaryService.findById(id, user.sub), { params: objectIdParam })
      .patch('/:id', ({ user, params: { id }, body }) => GlossaryService.update(id, user.sub, body), { params: objectIdParam, body: glossaryUpdate })
      .delete('/:id', ({ user, params: { id } }) => GlossaryService.remove(id, user.sub), { params: objectIdParam })
  )
