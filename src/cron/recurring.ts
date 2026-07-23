import cron from 'node-cron'
import { Task } from '../modules/tasks/schema'
import { ActivityService } from '../modules/activity/service'
import { connectDB } from '../libs/mongoose'
import { log } from '../libs/logger'

// Advance a date by `interval` units of the recurrence type.
const nextDueDate = (from: Date, type: string, interval: number): Date => {
  const d = new Date(from)
  switch (type) {
    case 'daily':
      d.setDate(d.getDate() + interval)
      break
    case 'weekly':
      d.setDate(d.getDate() + interval * 7)
      break
    case 'monthly':
      d.setMonth(d.getMonth() + interval)
      break
  }
  return d
}

/**
 * Scan completed recurring tasks and spawn the next occurrence. A fresh `todo`
 * copy is created with the due date advanced by the recurrence interval, and the
 * source task is flipped off recurrence so it isn't regenerated again.
 *
 * Exported so it can be triggered from a test or a Vercel cron endpoint too.
 */
export const processRecurringTasks = async () => {
  await connectDB()

  const due = await Task.find({
    'recurrence.type': { $ne: 'none' },
    status: 'done',
    isArchived: false,
  })

  let created = 0
  for (const task of due) {
    const base = task.dueDate ?? new Date()
    const interval = task.recurrence?.interval ?? 1
    const nextDue = nextDueDate(base, task.recurrence.type, interval)

    const clone = await Task.create({
      title: task.title,
      description: task.description,
      status: 'todo',
      priority: task.priority,
      dueDate: nextDue,
      tags: task.tags,
      workspace: task.workspace,
      createdBy: task.createdBy,
      assignedTo: task.assignedTo,
      parentTask: task.parentTask,
      checklist: task.checklist.map((c) => ({ text: c.text, done: false })),
      recurrence: task.recurrence,
    })
    await ActivityService.record(clone.id, task.createdBy.toString(), 'created', {
      recurredFrom: task.id,
    })

    // Stop the original from recurring again on the next run.
    task.recurrence = { type: 'none', interval: 1 }
    await task.save()
    created++
  }

  log.info({ processed: due.length, created }, 'Recurring task sweep complete')
  return { processed: due.length, created }
}

// Register the daily 00:00 job. Called once from src/index.ts (long-running dev
// / self-hosted). On Vercel, wire `processRecurringTasks` to a Vercel Cron
// endpoint instead — serverless functions don't stay alive to hold a schedule.
export const startRecurringCron = () => {
  cron.schedule('0 0 * * *', () => {
    processRecurringTasks().catch((err) => log.error({ err }, 'Recurring cron failed'))
  })
  log.info('Recurring task cron scheduled (daily at 00:00)')
}
