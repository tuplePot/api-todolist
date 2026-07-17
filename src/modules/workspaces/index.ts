import { Elysia, t } from 'elysia'
import { workspaceCreate, addMemberBody } from './model'
import { WorkspaceService } from './service'
import { guard } from '../../libs/guard'
import { objectId, objectIdParam } from '../../libs/schema'

export const workspacesModule = new Elysia({ prefix: '/workspaces' })
  .guard({}, (app) =>
    app
      .use(guard)
      .get('/', ({ user }) => WorkspaceService.findAllForUser(user.sub))
      .post('/', ({ user, body }) => WorkspaceService.create(user.sub, body), { body: workspaceCreate })
      .get(
        '/:id/summary',
        ({ user, params: { id } }) => WorkspaceService.summary(id, user.sub),
        { params: objectIdParam }
      )
      .post(
        '/:id/members',
        ({ user, params: { id }, body }) => WorkspaceService.addMember(id, user.sub, body),
        { params: objectIdParam, body: addMemberBody }
      )
      .delete(
        '/:id/members/:userId',
        ({ user, params: { id, userId } }) => WorkspaceService.removeMember(id, user.sub, userId),
        { params: t.Object({ id: objectId, userId: objectId }) }
      )
  )
