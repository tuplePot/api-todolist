import type { Types } from 'mongoose'

export interface IQA {
  question: string
  answer: string
  tags: string[]
  source: string
  isPinned: boolean
  createdBy: Types.ObjectId
}
