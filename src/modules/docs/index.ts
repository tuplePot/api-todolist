import { Elysia } from 'elysia'
import { html } from '@elysiajs/html'

type Ep = { m: string; p: string; d: string }

const groups: { title: string; desc: string; eps: Ep[] }[] = [
  {
    title: 'Workspaces',
    desc: 'Personal (auto-provisioned) & team workspaces. JWT required.',
    eps: [
      { m: 'GET', p: '/api/workspaces', d: 'List workspaces the user belongs to (personal + team)' },
      { m: 'POST', p: '/api/workspaces', d: 'Create a team workspace' },
      { m: 'GET', p: '/api/workspaces/:id/summary', d: 'Dashboard: counts per status, overdue, 7-day completion rate' },
      { m: 'POST', p: '/api/workspaces/:id/members', d: 'Add a member (owner/admin only)' },
      { m: 'DELETE', p: '/api/workspaces/:id/members/:userId', d: 'Remove a member' },
    ],
  },
  {
    title: 'Tasks',
    desc: 'CRUD, filtering, checklist, subtasks & activity. JWT + workspace membership.',
    eps: [
      { m: 'GET', p: '/api/tasks', d: 'List/filter (workspace, status, priority, tag, assignedTo, dueBefore/After, search, page, limit, sortBy, order)' },
      { m: 'POST', p: '/api/tasks', d: 'Create a task' },
      { m: 'GET', p: '/api/tasks/:id', d: 'Task detail incl. subtasks + latest activity' },
      { m: 'PATCH', p: '/api/tasks/:id', d: 'Partial update' },
      { m: 'DELETE', p: '/api/tasks/:id', d: 'Soft delete (isArchived = true)' },
      { m: 'PATCH', p: '/api/tasks/:id/status', d: 'Quick status change (logs status_changed)' },
      { m: 'POST', p: '/api/tasks/:id/checklist', d: 'Add checklist item' },
      { m: 'PATCH', p: '/api/tasks/:id/checklist/:itemId', d: 'Toggle/edit checklist item' },
      { m: 'GET', p: '/api/tasks/:id/subtasks', d: 'List subtasks' },
      { m: 'GET', p: '/api/tasks/:id/activity', d: 'Task activity log' },
    ],
  },
]

const cls = (m: string) => `m-${m.toLowerCase()}`

const rows = groups
  .map(
    (g) => `
  <section>
    <h2>${g.title}</h2>
    <p class="desc">${g.desc}</p>
    ${g.eps
      .map(
        (e) => `<div class="ep"><span class="badge ${cls(e.m)}">${e.m}</span><code>${e.p}</code><span class="d">${e.d}</span></div>`
      )
      .join('')}
  </section>`
  )
  .join('')

const page = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Vault Josh · Todolist API</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0d0f1a;--card:#131625;--border:#1f2340;--text:#dde3f5;--muted:#8892b5;
    --get:#22c55e;--post:#3b82f6;--patch:#f59e0b;--delete:#ef4444;--acc:#6366f1}
  body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
    font-size:14px;line-height:1.6;padding:40px 24px;max-width:900px;margin:0 auto}
  header{display:flex;align-items:center;gap:12px;margin-bottom:8px}
  .logo{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,var(--acc),#818cf8);font-size:18px}
  h1{font-size:20px;font-weight:800}
  .sub{color:var(--muted);font-size:12px;margin-bottom:28px}
  .envelope{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 18px;margin-bottom:28px;
    font-family:'Fira Code',Consolas,monospace;font-size:12px;color:var(--muted);white-space:pre;overflow-x:auto}
  section{margin-bottom:34px}
  h2{font-size:16px;font-weight:700;border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:4px}
  .desc{color:var(--muted);font-size:12px;margin-bottom:14px}
  .ep{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--border);
    border-radius:7px;padding:9px 14px;margin-bottom:8px;flex-wrap:wrap}
  .badge{font-family:'Fira Code',Consolas,monospace;font-size:10px;font-weight:800;padding:3px 8px;border-radius:4px;
    min-width:58px;text-align:center;flex-shrink:0}
  .m-get{background:rgba(34,197,94,.12);color:var(--get)}
  .m-post{background:rgba(59,130,246,.12);color:var(--post)}
  .m-patch{background:rgba(245,158,11,.12);color:var(--patch)}
  .m-delete{background:rgba(239,68,68,.12);color:var(--delete)}
  code{font-family:'Fira Code',Consolas,monospace;font-size:13px;color:#a5b4fc}
  .d{color:var(--muted);font-size:12px;flex:1;min-width:200px}
  footer{color:var(--muted);font-size:11px;margin-top:24px;border-top:1px solid var(--border);padding-top:14px}
</style>
</head>
<body>
  <header>
    <div class="logo">✓</div>
    <div><h1>Vault Josh · Todolist API</h1></div>
  </header>
  <div class="sub">Bun · Elysia · MongoDB — all endpoints require <code>Authorization: Bearer &lt;jwt&gt;</code></div>

  <div class="envelope">Response envelope:
{ "success": true,  "message": "...", "data": <object|array|null> }
{ "success": false, "message": "...", "errors"?: any, "data": null }</div>

  ${rows}

  <footer>Personal workspace is provisioned automatically on first <code>GET /api/workspaces</code>. Recurring tasks are regenerated by a daily 00:00 cron.</footer>
</body>
</html>`

export const docsModule = new Elysia()
  .use(html())
  .get('/docs', () => page)
