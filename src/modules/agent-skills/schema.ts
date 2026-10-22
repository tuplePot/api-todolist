import mongoose, { Schema } from "mongoose";
import { SKILL_PROMPT_MAX } from "./prompt";
import type { IAgentSkill } from "./types";

const AgentSkillSchema = new Schema<IAgentSkill>(
	{
		name: { type: String, required: true, trim: true, maxlength: 80 },
		role: { type: String, required: true, trim: true, maxlength: 120 },
		roleKey: { type: String, required: true },
		description: { type: String, maxlength: 500 },
		prompt: { type: String, default: "", maxlength: SKILL_PROMPT_MAX },
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

// One active skill per role in a workspace, so an agent's role picks exactly one.
AgentSkillSchema.index(
	{ workspace: 1, roleKey: 1 },
	{ unique: true, partialFilterExpression: { isArchived: false } },
);
AgentSkillSchema.index({ workspace: 1, isArchived: 1, position: 1 });

export const AgentSkill = mongoose.model<IAgentSkill>(
	"AgentSkill",
	AgentSkillSchema,
);
