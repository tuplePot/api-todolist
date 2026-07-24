import { GlossaryEntry } from './model'
import type { GlossaryCreate, GlossaryUpdate, GlossaryQuery } from './model'
import { ok, fail } from '../../libs/response'

export abstract class GlossaryService {
  static async create(userId: string, data: GlossaryCreate) {
    const entry = await GlossaryEntry.create({
      term: data.term,
      definition: data.definition,
      category: data.category ?? undefined,
      sourceNote: data.sourceNote ?? undefined,
      confidence: data.confidence ?? 'new',
      createdBy: userId,
    })
    return ok(entry, 'Glossary entry created')
  }

  static async findAll(userId: string, query: GlossaryQuery) {
    const page = query.page ?? 1
    const limit = query.limit ?? 50
    const filter: Record<string, unknown> = { createdBy: userId }

    if (query.category !== undefined) {
      filter.category = query.category
    }

    if (query.confidence !== undefined) {
      filter.confidence = query.confidence
    }

    const sort: Record<string, 1 | -1> = {}
    switch (query.sort) {
      case 'az':
        sort.term = 1
        break
      case 'newest':
        sort.createdAt = -1
        break
      case 'oldest':
        sort.createdAt = 1
        break
      default:
        sort.createdAt = -1
    }

    let queryBuilder = GlossaryEntry.find(filter)

    if (query.search) {
      queryBuilder = GlossaryEntry.find(
        { $text: { $search: query.search } },
        { score: { $meta: 'textScore' } as const }
      ).sort({ score: { $meta: 'textScore' }, ...sort })
    } else {
      queryBuilder = queryBuilder.sort(sort)
    }

    const [entries, total] = await Promise.all([
      queryBuilder.skip((page - 1) * limit).limit(limit).lean(),
      GlossaryEntry.countDocuments(filter),
    ])

    return ok({ entries, total, page, limit }, 'Glossary entries fetched')
  }

  static async findById(id: string, userId: string) {
    const entry = await GlossaryEntry.findOne({ _id: id, createdBy: userId }).lean()
    if (!entry) return fail(404, 'Glossary entry not found')
    return ok(entry, 'Glossary entry fetched')
  }

  static async update(id: string, userId: string, data: GlossaryUpdate) {
    const entry = await GlossaryEntry.findOne({ _id: id, createdBy: userId })
    if (!entry) return fail(404, 'Glossary entry not found')

    Object.assign(entry, data)
    await entry.save()
    return ok(entry, 'Glossary entry updated')
  }

  static async remove(id: string, userId: string) {
    const entry = await GlossaryEntry.findOneAndDelete({ _id: id, createdBy: userId }).lean()
    if (!entry) return fail(404, 'Glossary entry not found')
    return ok(entry, 'Glossary entry deleted')
  }
}
