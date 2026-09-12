import { t } from "elysia";
import mongoose, { Schema } from "mongoose";
import { objectId } from "../../libs/schema";
import type { INote } from "./types";

// ─── TypeBox schemas ──────────────────────────────────────────────────────────

// The frontend now stores hex colors straight from a color picker (e.g. "#facc15").
// Legacy named colors are still accepted so old notes remain editable.
const hexColor = t.String({
	pattern: "^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$",
});

const legacyColor = t.Union([
	t.Literal("yellow"),
	t.Literal("blue"),
	t.Literal("green"),
	t.Literal("pink"),
	t.Literal("purple"),
]);

const nullableColor = t.Union([hexColor, legacyColor, t.Null()]);

export const noteCreate = t.Object({
	title: t.String({ minLength: 1, maxLength: 255 }),
	content: t.Optional(t.String({ maxLength: 50000 })),
	tags: t.Optional(t.Array(t.String({ maxLength: 50 }))),
	isPinned: t.Optional(t.Boolean()),
	color: t.Optional(nullableColor),
	project: t.Optional(t.Union([t.String(), t.Null()])),
});

export const noteUpdate = t.Partial(
	t.Object({
		title: t.String({ minLength: 1, maxLength: 255 }),
		content: t.String({ maxLength: 50000 }),
		tags: t.Array(t.String({ maxLength: 50 })),
		isPinned: t.Boolean(),
		color: nullableColor,
		project: t.Union([t.String(), t.Null()]),
	}),
);

export const noteQuery = t.Object({
	tags: t.Optional(t.String()),
	isPinned: t.Optional(t.BooleanString()),
	search: t.Optional(t.String()),
	project: t.Optional(t.String()),
	page: t.Optional(t.Numeric({ minimum: 1 })),
	limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
	sortBy: t.Optional(
		t.Union([
			t.Literal("createdAt"),
			t.Literal("updatedAt"),
			t.Literal("title"),
		]),
	),
	order: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
});

export type NoteCreate = typeof noteCreate.static;
export type NoteUpdate = typeof noteUpdate.static;
export type NoteQuery = typeof noteQuery.static;

// ─── Mongoose model ───────────────────────────────────────────────────────────

const NoteSchema = new Schema<INote>(
	{
		title: { type: String, required: true, maxlength: 255 },
		content: { type: String, default: "", maxlength: 50000 },
		tags: { type: [String], default: [] },
		isPinned: { type: Boolean, default: false },
		// Hex color from the picker (e.g. "#facc15"); legacy named colors also allowed.
		color: { type: String, default: null },
		project: { type: Schema.Types.ObjectId, ref: "Project", default: null },
		createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
	},
	{ timestamps: true },
);

// Queries are always scoped to a single user, so the first index covers everything.
NoteSchema.index({ createdBy: 1, isPinned: -1, updatedAt: -1 });
NoteSchema.index({ createdBy: 1, tags: 1 });
NoteSchema.index({ createdBy: 1, project: 1 });
NoteSchema.index({ title: "text", content: "text" });

export const Note = mongoose.model<INote>("Note", NoteSchema);

// Re-export for shared reference in objectId param
export { objectId };
