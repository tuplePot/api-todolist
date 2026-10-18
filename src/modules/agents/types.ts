import type { Types } from "mongoose";

/** How much an agent may touch the open project folder in the AI office. */
export type AgentProjectAccess = "none" | "read" | "edit";
export type AgentEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface IAgent {
	/**
	 * Stable id used by the AI office (Kantor) as the employee id and folder
	 * name, e.g. "marcus-senior-swe". Unique per workspace.
	 */
	slug: string;
	name: string;
	/** Job title, e.g. "Senior Software Engineer". */
	role: string;
	team?: Types.ObjectId | null;
	/** One-line mission; the office router uses it to pick who handles a message. */
	mission?: string;
	/** Full role prompt (the employee's CLAUDE.md / AGENTS.md). */
	rolePrompt?: string;
	color?: string;
	/** Optional `.vrm` file name inside the office's `karakter/` folder. */
	vrm?: string | null;
	/** Claude model alias or id, e.g. "opus", "sonnet". */
	model?: string | null;
	effort?: AgentEffort | null;
	projectAccess: AgentProjectAccess;
	/** Read-only connector tool names (`mcp__…`) granted to this agent. */
	extraTools: string[];
	/** Extra folders (relative to the office root) the agent may read. */
	extraFolders: string[];
	workspace: Types.ObjectId;
	owner: Types.ObjectId;
	/** Display order in lists / the office. Ascending. */
	position: number;
	isArchived: boolean;
}
