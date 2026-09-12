import type { Types } from "mongoose";

// Hex color (e.g. "#facc15") or a legacy named color, or null for no color.
export type NoteColor = string | null;

export interface INote {
	title: string;
	content: string;
	tags: string[];
	isPinned: boolean;
	color: NoteColor;
	project?: Types.ObjectId | null;
	createdBy: Types.ObjectId;
}
