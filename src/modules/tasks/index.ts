import { Elysia, t } from 'elysia'
import {
  taskCreate,
  taskUpdate,
  taskQuery,
  statusBody,
  moveBody,
  checklistAddBody,
  checklistUpdateBody,
} from './model'
import { TaskService } from './service'
import { guard } from '../../libs/guard'
import { objectId, objectIdParam } from '../../libs/schema'

export const tasksModule = new Elysia({ prefix: '/tasks' })
  .guard({}, (app) =>
    app
      .use(guard)
      // ── CRUD ───────────────────────────────────────────────────────────────
      .get('/', ({ user, query }) => TaskService.findAll(user.sub, query), { query: taskQuery })
      .post('/', ({ user, body }) => TaskService.create(user.sub, body), { body: taskCreate })
      .get('/:id', ({ user, params: { id } }) => TaskService.findById(id, user.sub), {
        params: objectIdParam,
      })
      .patch('/:id', ({ user, params: { id }, body }) => TaskService.update(id, user.sub, body), {
        params: objectIdParam,
        body: taskUpdate,
      })
      .delete('/:id', ({ user, params: { id } }) => TaskService.remove(id, user.sub), {
        params: objectIdParam,
      })
      // ── Quick status (triggers status_changed activity) ────────────────────
      .patch(
        '/:id/status',
        ({ user, params: { id }, body }) => TaskService.updateStatus(id, user.sub, body.status),
        { params: objectIdParam, body: statusBody }
      )
      // ── Board move (status + fractional position in one write) ─────────────
      .patch(
        '/:id/move',
        ({ user, params: { id }, body }) =>
          TaskService.move(id, user.sub, body.status, body.position),
        { params: objectIdParam, body: moveBody }
      )
      // ── Checklist ──────────────────────────────────────────────────────────
      .post(
        '/:id/checklist',
        ({ user, params: { id }, body }) => TaskService.addChecklistItem(id, user.sub, body.text),
        { params: objectIdParam, body: checklistAddBody }
      )
      .patch(
        '/:id/checklist/:itemId',
        ({ user, params: { id, itemId }, body }) =>
          TaskService.updateChecklistItem(id, itemId, user.sub, body),
        { params: t.Object({ id: objectId, itemId: objectId }), body: checklistUpdateBody }
      )
      // ── Relations & audit ──────────────────────────────────────────────────
      .get('/:id/subtasks', ({ user, params: { id } }) => TaskService.listSubtasks(id, user.sub), {
        params: objectIdParam,
      })
      .get('/:id/activity', ({ user, params: { id } }) => TaskService.listActivity(id, user.sub), {
        params: objectIdParam,
      })
  )
