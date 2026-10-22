import type { Types } from "mongoose";

export interface IAgentTeam {
	name: string;
	description?: string;
	color?: string;
	/**
	 * Project this team (a room in the AI office) works on: its agents only take
	 * tickets of that project. Null = a general room that may take any project.
	 */
	project?: Types.ObjectId | null;
	workspace: Types.ObjectId;
	owner: Types.ObjectId;
	/** Display order in lists / the office. Ascending. */
	position: number;
	isArchived: boolean;
}
