import { Elysia } from 'elysia'
import { projectCreate, projectUpdate, projectQuery } from './model'
import { ProjectService } from './service'
import { guard } from '../../libs/guard'
import { objectIdParam } from '../../libs/schema'

export const projectsModule = new Elysia({ prefix: '/projects' })
  .guard({}, (app) =>
    app
      .use(guard)
      .get('/', ({ user, query }) => ProjectService.findAll(user.sub, query), { query: projectQuery })
      .post('/', ({ user, body }) => ProjectService.create(user.sub, body), { body: projectCreate })
      .get('/:id', ({ user, params: { id } }) => ProjectService.findById(id, user.sub), {
        params: objectIdParam,
      })
      .patch(
        '/:id',
        ({ user, params: { id }, body }) => ProjectService.update(id, user.sub, body),
        { params: objectIdParam, body: projectUpdate }
      )
      .delete('/:id', ({ user, params: { id } }) => ProjectService.remove(id, user.sub), {
        params: objectIdParam,
      })
  )
