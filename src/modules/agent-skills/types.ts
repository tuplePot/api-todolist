import type { Types } from "mongoose";

export interface IAgentSkill {
	/** Display name, e.g. "Fullstack Developer playbook". */
	name: string;
	/** Job title this skill is for, e.g. "Fullstack Developer". */
	role: string;
	/** Lowercased, single-spaced `role`: what agents are matched on. */
	roleKey: string;
	description?: string;
	/**
	 * Shared role prompt (the employee's CLAUDE.md). `{{AGENT_NAME}}` is
	 * replaced with each agent's name when the office reads it.
	 */
	prompt: string;
	workspace: Types.ObjectId;
	owner: Types.ObjectId;
	position: number;
	isArchived: boolean;
}
