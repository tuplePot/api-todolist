import type { Types } from "mongoose";

export type OfficeConnectionStatus =
	| "pending"
	| "approved"
	| "active"
	| "denied"
	| "revoked";

export interface IOfficeConnection {
	deviceName: string;
	status: OfficeConnectionStatus;
	/** Short code the owner sees in the office and confirms in josh-vault, e.g. "K7QM-4ZXR". */
	pairCode: string;
	/** SHA-256 of the secret the office polls with. */
	deviceCodeHash: string;
	/** SHA-256 of the office token (`kai_…`), set on approval. */
	tokenHash?: string | null;
	user?: Types.ObjectId | null;
	/**
	 * Legacy: connections used to be limited to one workspace. Ignored now; an
	 * office works in all of the user's team workspaces.
	 */
	workspace?: Types.ObjectId | null;
	/** Pending/approved pairings expire; cleared once the office holds its token. */
	expiresAt?: Date | null;
	approvedAt?: Date | null;
	lastUsedAt?: Date | null;
	revokedAt?: Date | null;
}

/** What `ctx.user` carries for a request made with an office token. */
export interface OfficeUser {
	sub: string;
	email: string;
	role: "office";
	officeId: string;
}
