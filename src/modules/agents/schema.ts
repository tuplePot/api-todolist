import mongoose, { Schema } from "mongoose";
import type { IAgent } from "./types";

const AgentSchema = new Schema<IAgent>(
	{
		slug: {
			type: String,
			required: true,
			trim: true,
			lowercase: true,
			maxlength: 60,
		},
		name: { type: String, required: true, trim: true, maxlength: 80 },
		role: { type: String, required: true, trim: true, maxlength: 120 },
		team: { type: Schema.Types.ObjectId, ref: "AgentTeam", default: null },
		mission: { type: String, maxlength: 500 },
		rolePrompt: { type: String, maxlength: 20000 },
		color: { type: String },
		vrm: { type: String, default: null },
		model: { type: String, default: null },
		effort: {
			type: String,
			enum: ["low", "medium", "high", "xhigh", "max", null],
			default: null,
		},
		projectAccess: {
			type: String,
			enum: ["none", "read", "edit"],
			default: "none",
		},
		extraTools: { type: [String], default: [] },
		extraFolders: { type: [String], default: [] },
		workspace: {
			type: Schema.Types.ObjectId,
			ref: "Workspace",
			required: true,
		},
		owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
		position: { type: Number, default: 0 },
		isArchived: { type: Boolean, default: false },
	},
	{ timestamps: true },
);

// One slug per workspace — the office uses it as a folder name.
AgentSchema.index({ workspace: 1, slug: 1 }, { unique: true });
AgentSchema.index({ workspace: 1, isArchived: 1, position: 1 });
AgentSchema.index({ team: 1 });

export const Agent = mongoose.model<IAgent>("Agent", AgentSchema);
