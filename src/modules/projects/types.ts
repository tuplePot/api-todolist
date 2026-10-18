import type { Types } from "mongoose";

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
	workspace: Types.ObjectId;
	owner: Types.ObjectId;
	isArchived: boolean;
}
