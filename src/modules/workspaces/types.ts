import type { Types } from 'mongoose'

export type WorkspaceType = 'personal' | 'team'
export type MemberRole = 'owner' | 'admin' | 'member'

export type BoardStatusId =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'cancelled'

export interface IWorkspaceStatusEntry {
  id: BoardStatusId
  label: string
  enabled: boolean
  position: number
}

export interface IWorkspaceMember {
  user: Types.ObjectId
  role: MemberRole
}

export interface IWorkspace {
  name: string
  type: WorkspaceType
  owner: Types.ObjectId
  members: IWorkspaceMember[]
  statusConfig: IWorkspaceStatusEntry[]
}
