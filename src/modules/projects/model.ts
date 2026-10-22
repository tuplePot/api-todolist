import { t } from "elysia";
import mongoose, { Schema } from "mongoose";
import { objectId } from "../../libs/schema";
import type { IProject } from "./types";

// ─── TypeBox schemas ──────────────────────────────────────────────────────────

/** Max code folders per project (1 main + 5 related, same as the AI office). */
export const REPO_PATHS_MAX = 6;

/** One code folder of a project, e.g. { label: "Backend", path: "D:\\code\\api" }. */
const repoPathEntry = t.Object({
	label: t.String({ minLength: 1, maxLength: 40 }),
	path: t.String({ minLength: 1, maxLength: 500 }),
});

const repoPathList = t.Array(repoPathEntry, { maxItems: REPO_PATHS_MAX });

export const projectCreate = t.Object({
	name: t.String({ minLength: 1, maxLength: 120 }),
	key: t.Optional(t.String({ minLength: 1, maxLength: 10 })),
	description: t.Optional(t.String({ maxLength: 1000 })),
	color: t.Optional(t.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
	repoPath: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
	relatedRepoPaths: t.Optional(
		t.Array(t.String({ minLength: 1, maxLength: 500 }), { maxItems: 5 }),
	),
	repoPaths: t.Optional(repoPathList),
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
		repoPaths: repoPathList,
	}),
);

export const projectQuery = t.Object({
	workspace: objectId,
	includeArchived: t.Optional(t.BooleanString()),
});

export type ProjectCreate = typeof projectCreate.static;
export type ProjectUpdate = typeof projectUpdate.static;
export type ProjectQuery = typeof projectQuery.static;
