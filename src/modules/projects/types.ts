import type { Types } from "mongoose";

export interface IProject {
	name: string;
	/** Short uppercase abbreviation derived from the project name, e.g. "JV" for "Josh Vault". */
	key: string;
	description?: string;
	color?: string;
	workspace: Types.ObjectId;
	owner: Types.ObjectId;
	isArchived: boolean;
}
