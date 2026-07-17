import app from '../src/app'

// Vercel serverless entrypoint — Elysia handles the raw Fetch request.
export default {
  fetch(request: Request) {
    return app.handle(request)
  },
}
