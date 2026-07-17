import type { Types } from 'mongoose'

export interface IProject {
  name: string
  description?: string
  color?: string
  workspace: Types.ObjectId
  owner: Types.ObjectId
  isArchived: boolean
}
