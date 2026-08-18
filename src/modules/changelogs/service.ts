import { Changelog } from './model'
import type { ChangelogCreate, ChangelogUpdate, ChangelogQuery } from './model'
import { ok, fail } from '../../libs/response'

export abstract class ChangelogService {
  // ─── Create ────────────────────────────────────────────────────────────────

  static async create(userId: string, data: ChangelogCreate) {
    const changelog = await Changelog.create({
      version: data.version.trim(),
      content: data.content,
      project: data.project,
      createdBy: userId,
      releasedAt: data.releasedAt ? new Date(data.releasedAt) : null,
    })
    return ok(changelog, 'Changelog entry created')
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  static async findAll(userId: string, query: ChangelogQuery) {
    const [changelogs, total] = await Promise.all([
      Changelog.find({ project: query.project, createdBy: userId })
        .sort({ createdAt: -1 })
        .lean(),
      Changelog.countDocuments({ project: query.project, createdBy: userId }),
    ])
    return ok({ changelogs, total }, 'Changelogs fetched')
  }

  static async findById(id: string, userId: string) {
    const changelog = await Changelog.findOne({ _id: id, createdBy: userId }).lean()
    if (!changelog) return fail(404, 'Changelog entry not found')
    return ok(changelog, 'Changelog entry fetched')
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  static async update(id: string, userId: string, data: ChangelogUpdate) {
    const changelog = await Changelog.findOne({ _id: id, createdBy: userId })
    if (!changelog) return fail(404, 'Changelog entry not found')

    if (data.version !== undefined) changelog.version = data.version.trim()
    if (data.content !== undefined) changelog.content = data.content
    if ('releasedAt' in data)
      changelog.releasedAt = data.releasedAt ? new Date(data.releasedAt) : null

    await changelog.save()
    return ok(changelog, 'Changelog entry updated')
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  static async remove(id: string, userId: string) {
    const changelog = await Changelog.findOneAndDelete({ _id: id, createdBy: userId }).lean()
    if (!changelog) return fail(404, 'Changelog entry not found')
    return ok(changelog, 'Changelog entry deleted')
  }
}
