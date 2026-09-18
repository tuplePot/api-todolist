import { fail, ok } from "../../libs/response";
import type { SharedNoteCreate } from "./model";
import { generateSlug, SharedNote } from "./model";

export abstract class SharedNoteService {
	/**
	 * Store a note body and hand back a short slug for the share link. Retries a
	 * few times if a freshly generated slug happens to already exist.
	 */
	static async create(userId: string | undefined, data: SharedNoteCreate) {
		for (let attempt = 0; attempt < 5; attempt++) {
			const slug = generateSlug();
			const exists = await SharedNote.exists({ slug });
			if (exists) continue;

			const note = await SharedNote.create({
				slug,
				content: data.content,
				language: data.language ?? undefined,
				createdBy: userId ?? undefined,
			});
			return ok({ slug: note.slug }, "Share link created");
		}
		return fail(500, "Could not allocate a share link, please try again");
	}

	/** Public read — resolve a slug to its note body and bump the view counter. */
	static async findBySlug(slug: string) {
		const note = await SharedNote.findOneAndUpdate(
			{ slug },
			{ $inc: { views: 1 } },
			{ new: true },
		).lean();
		if (!note) return fail(404, "Shared note not found");

		return ok(
			{
				slug: note.slug,
				content: note.content,
				language: note.language,
				views: note.views,
			},
			"Shared note fetched",
		);
	}
}
