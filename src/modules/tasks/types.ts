import type { Types } from "mongoose";

export type TaskStatus =
	| "backlog"
	| "todo"
	| "in_progress"
	| "in_review"
	| "done"
	| "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type RecurrenceType = "none" | "daily" | "weekly" | "monthly";
export type IssueType = "feature" | "bug" | "task" | "chore";

export interface IChecklistItem {
	text: string;
	done: boolean;
}

export interface IRecurrence {
	type: RecurrenceType;
	interval: number;
}

export interface ITask {
	title: string;
	description?: string;
	status: TaskStatus;
	priority: TaskPriority;
	issueType: IssueType;
	/** Optional custom marker icon (Iconify name, e.g. "lucide:flag"). */
	icon?: string | null;
	dueDate?: Date | null;
	tags: string[];
	workspace: Types.ObjectId;
	project?: Types.ObjectId | null;
	createdBy: Types.ObjectId;
	assignedTo?: Types.ObjectId | null;
	/** AI agent assigned to work this ticket (see the agents module). */
	assignedAgent?: Types.ObjectId | null;
	parentTask?: Types.ObjectId | null;
	checklist: IChecklistItem[];
	recurrence: IRecurrence;
	isArchived: boolean;
	/** Sort key within a board column. Fractional so a move rewrites one doc. */
	position: number;
	/** Custom card color in hex format (e.g. "#FF5733"). */
	colorTask?: string | null;
	/** Sequential number within the project (e.g. 523). Only set when task has a project. */
	ticketNumber?: number;
	/** Pre-computed ticket key, e.g. "JV-523". Only set when task has a project. */
	ticketKey?: string;
}
