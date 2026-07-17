# Vault Josh · Todolist API

REST API for the **Todolist** feature of Vault Josh — personal productivity **and**
team task management, separated by the concept of a *workspace*.

Built with **Bun + Elysia + MongoDB (Mongoose)**, following the same modular
architecture as `api-paperly` (routes / service / model split per module).

## Tech Stack

| Concern      | Choice                                   |
| ------------ | ---------------------------------------- |
| Runtime      | Bun                                      |
| Framework    | Elysia                                   |
| Database     | MongoDB + Mongoose 7                      |
| Validation   | Elysia `t` (TypeBox) per endpoint        |
| Auth         | JWT (`Authorization: Bearer <token>`)    |
| Scheduling   | `node-cron` (daily recurring-task sweep) |
| Logging      | pino (`@bogeychan/elysia-logger`)        |

## Getting Started

```bash
bun install
cp .env.example .env    # then fill in DATABASE_URL, JWT_SECRET
bun run dev             # http://127.0.0.1:5000  ·  docs at /docs
```

| Script          | Purpose                          |
| --------------- | -------------------------------- |
| `bun run dev`   | Watch-mode dev server            |
| `bun run start` | Run once (no watch)              |
| `bun test`      | Run the test suite               |

### Environment (`.env`)

```
DATABASE_URL=mongodb+srv://.../todoListJoeDb
JWT_SECRET=<must match the Vault Josh auth service>
PORT=5000
LOG_LEVEL=debug
```

## Architecture

```
src/
├─ app.ts               Elysia app assembly (middleware + module mounting)
├─ index.ts             Local dev entry (listen + start cron)
├─ interfaces/          Shared TS interfaces
├─ libs/                mongoose · logger · response (envelope) · guard (JWT) · schema helpers
├─ cron/recurring.ts    Daily recurring-task generator
└─ modules/
   ├─ users/            Minimal User schema (owned by the auth service)
   ├─ workspaces/       model · service · index (routes) · types
   ├─ tasks/            model · service · index · types
   ├─ activity/         ActivityLog model + service (audit trail)
   └─ docs/             HTML endpoint reference at /docs
api/index.ts            Vercel serverless entrypoint
```

Each module keeps **routes thin** — all business logic lives in the `service`
layer, and activity logging happens there (never in a route handler).

## Authentication

Every endpoint is protected. A JWT middleware (`libs/guard.ts`) verifies the
`Authorization: Bearer <token>` header and injects `ctx.user` (`{ sub, email }`),
where `sub` is the user id. The token is expected to be issued by the Vault Josh
auth service and signed with the same `JWT_SECRET`.

Access control: before reading or modifying any task the service verifies the
caller is a **member of the task's workspace** (403 otherwise).

> The **personal** workspace is created lazily on the first
> `GET /api/workspaces` call (registration lives in the auth service, so it is
> provisioned on first access here).

## Response Envelope

```jsonc
// success
{ "success": true,  "message": "…", "data": <object | array | null> }
// error
{ "success": false, "message": "…", "errors"?: <any>, "data": null }
```

## Endpoints

All paths are prefixed with `/api`.

### Workspaces
| Method | Path                                   | Description                                    |
| ------ | -------------------------------------- | ---------------------------------------------- |
| GET    | `/workspaces`                          | List the user's workspaces (personal + team)   |
| POST   | `/workspaces`                          | Create a team workspace                        |
| GET    | `/workspaces/:id/summary`              | Status counts, overdue, 7-day completion rate  |
| POST   | `/workspaces/:id/members`              | Add a member (owner/admin only)                |
| DELETE | `/workspaces/:id/members/:userId`      | Remove a member                                |

### Tasks
| Method | Path                                   | Description                                    |
| ------ | -------------------------------------- | ---------------------------------------------- |
| GET    | `/tasks`                               | List + filter (see query params below)         |
| POST   | `/tasks`                               | Create a task                                  |
| GET    | `/tasks/:id`                           | Detail incl. subtasks + latest activity        |
| PATCH  | `/tasks/:id`                           | Partial update                                 |
| DELETE | `/tasks/:id`                           | Soft delete (`isArchived = true`)              |
| PATCH  | `/tasks/:id/status`                    | Quick status change (logs `status_changed`)    |
| POST   | `/tasks/:id/checklist`                 | Add checklist item                             |
| PATCH  | `/tasks/:id/checklist/:itemId`         | Toggle / edit checklist item                   |
| GET    | `/tasks/:id/subtasks`                  | List subtasks                                  |
| GET    | `/tasks/:id/activity`                  | Task activity log                              |

**`GET /tasks` query params:** `workspace`, `status`, `priority`, `tag`,
`assignedTo`, `dueBefore`, `dueAfter`, `search` (title/description),
`parentTask`, `includeArchived`, `page`, `limit`, `sortBy`
(`createdAt|updatedAt|dueDate|priority|title`), `order` (`asc|desc`).

## Activity Log

Written automatically in the service layer on: task creation, status change,
assignment/unassignment, important-field edits, checklist changes, and archiving.
Each entry stores `{ task, user, action, metadata, createdAt }`.

## Recurring Tasks

`src/cron/recurring.ts` registers a **daily 00:00** job that finds `done` tasks
with `recurrence.type !== 'none'` and spawns a fresh `todo` copy with the due
date advanced by the recurrence interval (`daily`/`weekly`/`monthly`). The
original is flipped to `recurrence.type = 'none'` so it is not regenerated.

- **Self-hosted / local:** the cron runs inside the long-lived process (started
  from `src/index.ts`).
- **Vercel (serverless):** processes don't stay alive to hold a schedule — call
  the exported `processRecurringTasks()` from a Vercel Cron endpoint instead.

## Indexes

`Task`: `{workspace, status}`, `{workspace, isArchived}`, `{assignedTo}`,
`{dueDate}`, `{parentTask}`, text index on `{title, description}`.
`Workspace`: `{members.user}`, `{owner, type}`.
`ActivityLog`: `{task, createdAt}`.

## Tests

```bash
bun test
```

The suite (`tests/task.test.ts`) drives the task CRUD flow through
`app.handle(...)` with a signed JWT. It runs against an isolated
`<db>_test` database (derived from `DATABASE_URL`) and cleans up after itself.

## Deployment

`vercel.json` rewrites all traffic to `api/index.ts`, which forwards raw Fetch
requests into the Elysia app (`app.handle`). Set `DATABASE_URL` and `JWT_SECRET`
as Vercel environment variables.
