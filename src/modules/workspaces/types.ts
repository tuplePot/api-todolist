import type { Types } from 'mongoose'

export type WorkspaceType = 'personal' | 'team'
export type MemberRole = 'owner' | 'admin' | 'member'

export interface IWorkspaceMember {
  user: Types.ObjectId
  role: MemberRole
}

export interface IWorkspace {
  name: string
  type: WorkspaceType
  owner: Types.ObjectId
  members: IWorkspaceMember[]
}
