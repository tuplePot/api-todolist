import type { Types } from 'mongoose'

export type ConfidenceLevel = 'new' | 'learning' | 'known'

export interface IGlossaryEntry {
  term: string
  definition: string
  category?: string
  sourceNote?: string
  confidence: ConfidenceLevel
  createdBy: Types.ObjectId
}
