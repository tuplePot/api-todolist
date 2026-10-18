import type { MemberRole } from "../modules/workspaces/types";

// Roles allowed to change workspace-level configuration such as AI agents.
// Agents can be granted edit access to real repositories, so plain members
// may read them but not create/modify them.
export const canManage = (role: MemberRole | null): boolean =>
	role === "owner" || role === "admin";
