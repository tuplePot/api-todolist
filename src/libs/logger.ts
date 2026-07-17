import { createPinoLogger } from '@bogeychan/elysia-logger'

const isProd = process.env.NODE_ENV === 'production'

// Shared pino logger. Pretty, colorized output in dev; plain JSON in prod so a
// log aggregator can parse it. Import `log` in services/lifecycle hooks; inside
// route handlers prefer `ctx.log` (provided by `log.into()` in app.ts).
export const log = createPinoLogger({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
        },
      }),
})
