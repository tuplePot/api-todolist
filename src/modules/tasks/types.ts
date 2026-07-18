import type { Types } from 'mongoose'

export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly'

export interface IChecklistItem {
  text: string
  done: boolean
}

export interface IRecurrence {
  type: RecurrenceType
  interval: number
}

export interface ITask {
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  /** Optional custom marker icon (Iconify name, e.g. "lucide:flag"). */
  icon?: string | null
  dueDate?: Date | null
  tags: string[]
  workspace: Types.ObjectId
  project?: Types.ObjectId | null
  createdBy: Types.ObjectId
  assignedTo?: Types.ObjectId | null
  parentTask?: Types.ObjectId | null
  checklist: IChecklistItem[]
  recurrence: IRecurrence
  isArchived: boolean
  /** Sort key within a board column. Fractional so a move rewrites one doc. */
  position: number
}
