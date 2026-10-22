import mongoose, { Schema } from "mongoose";
import type { IProject } from "./types";

const ProjectSchema = new Schema<IProject>(
	{
		name: { type: String, required: true, maxlength: 120 },
		key: { type: String, required: true, maxlength: 10, uppercase: true },
		description: { type: String, maxlength: 1000 },
		color: { type: String },
		repoPath: { type: String, maxlength: 500, default: null },
		relatedRepoPaths: { type: [String], default: [] },
		repoPaths: {
			type: [
				new Schema(
					{
						label: { type: String, required: true, maxlength: 40 },
						path: { type: String, required: true, maxlength: 500 },
					},
					{ _id: false },
				),
			],
			default: [],
		},
		workspace: {
			type: Schema.Types.ObjectId,
			ref: "Workspace",
			required: true,
		},
		owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
		isArchived: { type: Boolean, default: false },
	},
	{ timestamps: true },
);

ProjectSchema.index({ workspace: 1, isArchived: 1 });
ProjectSchema.index({ owner: 1 });

export const Project = mongoose.model<IProject>("Project", ProjectSchema);
