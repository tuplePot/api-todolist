import type { Types } from 'mongoose'

export interface IChangelog {
  version: string
  content: string
  project: Types.ObjectId
  createdBy: Types.ObjectId
  releasedAt: Date | null
}
