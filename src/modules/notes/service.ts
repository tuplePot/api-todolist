import { Note } from './model'
import type { NoteCreate, NoteUpdate, NoteQuery } from './model'
import { ok, fail } from '../../libs/response'

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export abstract class NoteService {
  // ─── Create ────────────────────────────────────────────────────────────────

  static async create(userId: string, data: NoteCreate) {
    const note = await Note.create({
      title: data.title,
      content: data.content ?? '',
      tags: data.tags ?? [],
      isPinned: data.isPinned ?? false,
      color: data.color ?? null,
      createdBy: userId,
    })
    return ok(note, 'Note created')
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  static async findAll(userId: string, query: NoteQuery) {
    const page = query.page ?? 1
    const limit = query.limit ?? 50
    const filter: Record<string, unknown> = { createdBy: userId }

    if (query.isPinned !== undefined) filter.isPinned = query.isPinned

    if (query.tags) {
      const tagList = query.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      if (tagList.length > 0) filter.tags = { $all: tagList }
    }

    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i')
      filter.$or = [{ title: rx }, { content: rx }]
    }

    const sortBy = query.sortBy ?? 'updatedAt'
    const order = query.order === 'asc' ? 1 : -1

    const [notes, total] = await Promise.all([
      Note.find(filter)
        .sort({ isPinned: -1, [sortBy]: order, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Note.countDocuments(filter),
    ])

    return ok({ notes, total, page, limit }, 'Notes fetched')
  }

  static async findById(id: string, userId: string) {
    const note = await Note.findOne({ _id: id, createdBy: userId }).lean()
    if (!note) return fail(404, 'Note not found')
    return ok(note, 'Note fetched')
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  static async update(id: string, userId: string, data: NoteUpdate) {
    const note = await Note.findOne({ _id: id, createdBy: userId })
    if (!note) return fail(404, 'Note not found')

    Object.assign(note, data)
    await note.save()
    return ok(note, 'Note updated')
  }

  static async togglePin(id: string, userId: string) {
    const note = await Note.findOne({ _id: id, createdBy: userId })
    if (!note) return fail(404, 'Note not found')

    note.isPinned = !note.isPinned
    await note.save()
    return ok(note, note.isPinned ? 'Note pinned' : 'Note unpinned')
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  static async remove(id: string, userId: string) {
    const note = await Note.findOneAndDelete({ _id: id, createdBy: userId }).lean()
    if (!note) return fail(404, 'Note not found')
    return ok(note, 'Note deleted')
  }
}
