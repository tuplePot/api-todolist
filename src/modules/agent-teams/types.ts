import type { Types } from "mongoose";

export interface IAgentTeam {
	name: string;
	description?: string;
	color?: string;
	workspace: Types.ObjectId;
	owner: Types.ObjectId;
	/** Display order in lists / the office. Ascending. */
	position: number;
	isArchived: boolean;
}
