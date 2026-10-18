import mongoose, { Schema } from "mongoose";
import type { IOfficeConnection } from "./types";

// One AI office (Kantor AI desktop app) linked to one user + workspace.
// Lifecycle: pending (pair code shown in the office) → approved (owner clicked
// "Allow" in josh-vault) → active (the office picked up its token once).
// Only SHA-256 hashes of the device code and the token are stored.
const OfficeConnectionSchema = new Schema<IOfficeConnection>(
	{
		deviceName: { type: String, required: true, trim: true, maxlength: 80 },
		status: {
			type: String,
			enum: ["pending", "approved", "active", "denied", "revoked"],
			default: "pending",
		},
		pairCode: { type: String, required: true },
		deviceCodeHash: { type: String, required: true },
		tokenHash: { type: String, default: null },
		user: { type: Schema.Types.ObjectId, ref: "User", default: null },
		workspace: { type: Schema.Types.ObjectId, ref: "Workspace", default: null },
		expiresAt: { type: Date, default: null },
		approvedAt: { type: Date, default: null },
		lastUsedAt: { type: Date, default: null },
		revokedAt: { type: Date, default: null },
	},
	{ timestamps: true },
);

OfficeConnectionSchema.index({ pairCode: 1, status: 1 });
OfficeConnectionSchema.index({ deviceCodeHash: 1 });
OfficeConnectionSchema.index({ tokenHash: 1 }, { sparse: true });
OfficeConnectionSchema.index({ user: 1, status: 1 });
// Unfinished pairings delete themselves (expiresAt is cleared once active).
OfficeConnectionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OfficeConnection = mongoose.model<IOfficeConnection>(
	"OfficeConnection",
	OfficeConnectionSchema,
);
