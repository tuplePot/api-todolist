import app from './app'
import { log } from './libs/logger'
import { startRecurringCron } from './cron/recurring'

app.listen({ port: Number(process.env.PORT ?? 5000), hostname: process.env.HOST ?? '0.0.0.0' })

// Long-running process (local dev / self-host) — register the daily recurrence job.
startRecurringCron()

log.info(`Elysia is running at ${app.server?.hostname}:${app.server?.port}`)
