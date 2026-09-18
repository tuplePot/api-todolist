import { Elysia } from "elysia";
import { guard } from "../../libs/guard";
import { sharedNoteCreate, sharedNoteParam } from "./model";
import { SharedNoteService } from "./service";

export const sharedNotesModule = new Elysia({ prefix: "/shared-notes" })
	// Public read — anyone with the link can open it, so no auth guard here.
	.get("/:slug", ({ params: { slug } }) => SharedNoteService.findBySlug(slug), {
		params: sharedNoteParam,
	})
	// Authenticated create — the note body is stored once and a short slug is
	// returned for the share link.
	.guard({}, (app) =>
		app
			.use(guard)
			.post("/", ({ user, body }) => SharedNoteService.create(user.sub, body), {
				body: sharedNoteCreate,
			}),
	);
