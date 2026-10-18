import { t } from "elysia";
import mongoose, { Schema } from "mongoose";
import { objectId } from "../../libs/schema";
import type { IProject } from "./types";

// ─── TypeBox schemas ──────────────────────────────────────────────────────────

export const projectCreate = t.Object({
	name: t.String({ minLength: 1, maxLength: 120 }),
	key: t.Optional(t.String({ minLength: 1, maxLength: 10 })),
	description: t.Optional(t.String({ maxLength: 1000 })),
	color: t.Optional(t.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
	repoPath: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
	relatedRepoPaths: t.Optional(
		t.Array(t.String({ minLength: 1, maxLength: 500 }), { maxItems: 5 }),
	),
	workspace: objectId,
});

export const projectUpdate = t.Partial(
	t.Object({
		name: t.String({ minLength: 1, maxLength: 120 }),
		key: t.String({ minLength: 1, maxLength: 10 }),
		description: t.String({ maxLength: 1000 }),
		color: t.Union([t.String({ pattern: "^#[0-9a-fA-F]{6}$" }), t.Null()]),
		repoPath: t.Union([t.String({ maxLength: 500 }), t.Null()]),
		relatedRepoPaths: t.Array(t.String({ minLength: 1, maxLength: 500 }), {
			maxItems: 5,
		}),
	}),
);

export const projectQuery = t.Object({
	workspace: objectId,
	includeArchived: t.Optional(t.BooleanString()),
});

export type ProjectCreate = typeof projectCreate.static;
export type ProjectUpdate = typeof projectUpdate.static;
export type ProjectQuery = typeof projectQuery.static;
