import mongoose, { Schema } from "mongoose";
import type { IAgentTeam } from "./types";

const AgentTeamSchema = new Schema<IAgentTeam>(
	{
		name: { type: String, required: true, trim: true, maxlength: 80 },
		description: { type: String, maxlength: 500 },
		color: { type: String },
		project: { type: Schema.Types.ObjectId, ref: "Project", default: null },
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

AgentTeamSchema.index({ workspace: 1, isArchived: 1, position: 1 });
AgentTeamSchema.index({ workspace: 1, name: 1 });
AgentTeamSchema.index({ project: 1 });

export const AgentTeam = mongoose.model<IAgentTeam>(
	"AgentTeam",
	AgentTeamSchema,
);
