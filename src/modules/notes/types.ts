import type { Types } from 'mongoose'

export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | null

export interface INote {
  title: string
  content: string
  tags: string[]
  isPinned: boolean
  color: NoteColor
  createdBy: Types.ObjectId
}
