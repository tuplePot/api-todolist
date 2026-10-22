import type { Types } from "mongoose";

/** One labelled code folder of a project, e.g. Backend or Frontend. */
export interface IRepoPath {
	label: string;
	path: string;
}

export interface IProject {
	name: string;
	/** Short uppercase abbreviation derived from the project name, e.g. "JV" for "Josh Vault". */
	key: string;
	description?: string;
	color?: string;
	/**
	 * Local folder of the project's code on the owner's computer, e.g.
	 * "D:\\code\\josh-vault". The AI office opens it when an agent works a ticket.
	 */
	repoPath?: string | null;
	/**
	 * Other local repos a ticket of this project may also touch, e.g. the API
	 * repo of a frontend project. The AI office grants access to them too.
	 */
	relatedRepoPaths?: string[];
	/**
	 * All code folders of the project with a label, e.g.
	 * [{ label: "Backend", path: "D:\\code\\api" }, { label: "Frontend", ... }].
	 * The first one is the main folder (where the AI office runs commands).
	 * `repoPath` / `relatedRepoPaths` are kept in sync with it for older clients.
	 */
	repoPaths?: IRepoPath[];
	workspace: Types.ObjectId;
	owner: Types.ObjectId;
	isArchived: boolean;
}
