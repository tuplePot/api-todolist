import { t } from "elysia";
import mongoose, { Schema } from "mongoose";
import type { ISharedNote } from "./types";

// ─── Request validation ──────────────────────────────────────────
// 200 KB of text is far more than any real note but well under Mongo's 16 MB
// document ceiling — a sane guard against someone dumping a whole file.
export const sharedNoteCreate = t.Object({
	content: t.String({ minLength: 1, maxLength: 200_000 }),
	language: t.Optional(t.String({ maxLength: 40 })),
});

// Slug: URL-safe base62, 6–16 chars. Loose enough to accept future length
// changes without breaking old links.
export const sharedNoteParam = t.Object({
	slug: t.String({ pattern: "^[0-9A-Za-z]{6,16}$" }),
});

export type SharedNoteCreate = typeof sharedNoteCreate.static;

// ─── Slug generation ─────────────────────────────────────────────
const SLUG_ALPHABET =
	"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SLUG_LENGTH = 8;

/**
 * A short, random, URL-safe slug. 62^8 ≈ 2.2e14 possibilities, so collisions
 * are vanishingly rare; the service still retries on the off chance.
 */
export function generateSlug(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(SLUG_LENGTH));
	let out = "";
	for (let i = 0; i < SLUG_LENGTH; i++) {
		out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
	}
	return out;
}

// ─── Mongoose model ──────────────────────────────────────────────
const SharedNoteSchema = new Schema<ISharedNote>(
	{
		slug: { type: String, required: true, unique: true },
		content: { type: String, required: true, maxlength: 200_000 },
		language: { type: String, maxlength: 40 },
		views: { type: Number, default: 0 },
		createdBy: { type: Schema.Types.ObjectId, ref: "User" },
	},
	{ timestamps: true },
);

export const SharedNote = mongoose.model<ISharedNote>(
	"SharedNote",
	SharedNoteSchema,
);
