import { QA } from './model'
import type { QACreate, QAUpdate, QAQuery } from './model'
import { ok, fail } from '../../libs/response'

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export abstract class QAService {
  // ─── Create ────────────────────────────────────────────────────────────────

  static async create(userId: string, data: QACreate) {
    const qa = await QA.create({
      question: data.question,
      answer: data.answer,
      tags: data.tags ?? [],
      source: data.source ?? '',
      isPinned: data.isPinned ?? false,
      createdBy: userId,
    })
    return ok(qa, 'Q&A created')
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  static async findAll(userId: string, query: QAQuery) {
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
      filter.$or = [{ question: rx }, { answer: rx }, { source: rx }]
    }

    const sortBy = query.sortBy ?? 'updatedAt'
    const order = query.order === 'asc' ? 1 : -1

    const [items, total] = await Promise.all([
      QA.find(filter)
        .sort({ isPinned: -1, [sortBy]: order, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      QA.countDocuments(filter),
    ])

    return ok({ items, total, page, limit }, 'Q&As fetched')
  }

  static async findById(id: string, userId: string) {
    const qa = await QA.findOne({ _id: id, createdBy: userId }).lean()
    if (!qa) return fail(404, 'Q&A not found')
    return ok(qa, 'Q&A fetched')
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  static async update(id: string, userId: string, data: QAUpdate) {
    const qa = await QA.findOne({ _id: id, createdBy: userId })
    if (!qa) return fail(404, 'Q&A not found')
    Object.assign(qa, data)
    await qa.save()
    return ok(qa, 'Q&A updated')
  }

  static async togglePin(id: string, userId: string) {
    const qa = await QA.findOne({ _id: id, createdBy: userId })
    if (!qa) return fail(404, 'Q&A not found')
    qa.isPinned = !qa.isPinned
    await qa.save()
    return ok(qa, qa.isPinned ? 'Q&A pinned' : 'Q&A unpinned')
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  static async remove(id: string, userId: string) {
    const qa = await QA.findOneAndDelete({ _id: id, createdBy: userId }).lean()
    if (!qa) return fail(404, 'Q&A not found')
    return ok(qa, 'Q&A deleted')
  }
}
