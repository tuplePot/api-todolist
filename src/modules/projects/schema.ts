import mongoose, { Schema } from 'mongoose'
import type { IProject } from './types'

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 1000 },
    color: { type: String },
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
)

ProjectSchema.index({ workspace: 1, isArchived: 1 })
ProjectSchema.index({ owner: 1 })

export const Project = mongoose.model<IProject>('Project', ProjectSchema)
