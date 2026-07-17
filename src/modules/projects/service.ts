import { Project, type ProjectCreate, type ProjectUpdate, type ProjectQuery } from './model'
import { WorkspaceService } from '../workspaces/service'
import { ok, fail } from '../../libs/response'

export abstract class ProjectService {
  /** Fetch a project and verify the caller has access to its workspace. */
  private static async accessible(projectId: string, userId: string) {
    const project = await Project.findById(projectId)
    if (!project) return { project: null, role: null }
    const role = await WorkspaceService.membershipRole(project.workspace.toString(), userId)
    return { project, role }
  }

  static async findAll(userId: string, query: ProjectQuery) {
    const role = await WorkspaceService.membershipRole(query.workspace, userId)
    if (!role) return fail(403, 'You do not have access to this workspace')

    const filter: Record<string, unknown> = { workspace: query.workspace }
    if (!query.includeArchived) filter.isArchived = false

    const projects = await Project.find(filter).sort({ createdAt: 1 }).lean()
    return ok(projects, 'Projects fetched')
  }

  static async findById(id: string, userId: string) {
    const { project, role } = await this.accessible(id, userId)
    if (!project) return fail(404, 'Project not found')
    if (!role) return fail(403, 'You do not have access to this project')
    return ok(project, 'Project fetched')
  }

  static async create(userId: string, data: ProjectCreate) {
    const role = await WorkspaceService.membershipRole(data.workspace, userId)
    if (!role) return fail(403, 'You do not have access to this workspace')

    const project = await Project.create({ ...data, owner: userId })
    return ok(project, 'Project created')
  }

  static async update(id: string, userId: string, data: ProjectUpdate) {
    const { project, role } = await this.accessible(id, userId)
    if (!project) return fail(404, 'Project not found')
    if (!role) return fail(403, 'You do not have access to this project')

    Object.assign(project, data)
    await project.save()
    return ok(project, 'Project updated')
  }

  static async remove(id: string, userId: string) {
    const { project, role } = await this.accessible(id, userId)
    if (!project) return fail(404, 'Project not found')
    if (!role) return fail(403, 'You do not have access to this project')

    if (project.isArchived) return ok(project, 'Project already archived')

    project.isArchived = true
    await project.save()
    return ok(project, 'Project archived')
  }
}
