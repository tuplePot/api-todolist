import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { helmet } from 'elysia-helmet'
import { connectDB, mongoosePlugin, checkConnection } from './libs/mongoose'
import { log } from './libs/logger'
import { docsModule } from './modules/docs'

// Register the User schema so `populate('assignedTo'|'createdBy'|'user')` resolves.
import './modules/users/model'

import { workspacesModule } from './modules/workspaces'
import { tasksModule } from './modules/tasks'
import { projectsModule } from './modules/projects'

const isProd = process.env.NODE_ENV === 'production'

const app = new Elysia()
  .use(helmet())
  .use(
    cors({
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    })
  )
  .use(log.into())
  // Ensure a DB connection on every request (serverless-friendly, idempotent).
  .onBeforeHandle(connectDB)
  .use(mongoosePlugin)
  .use(isProd ? new Elysia() : docsModule)
  .get('/', ({ set }) => {
    set.status = 404
    return null
  })
  .get('/health', () => ({ success: true, message: 'ok', data: checkConnection() }))
  .group('/api', (app) =>
    app
      .use(workspacesModule) // /api/workspaces
      .use(projectsModule)   // /api/projects
      .use(tasksModule)      // /api/tasks
  )

export default app
