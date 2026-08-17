// Mirrors server/models/WorkspaceMember.ts. Keep the two in step.
//
// This drives affordances only — hiding buttons a user cannot use. The server
// middleware is the actual enforcement; nothing here is a security boundary.

export const ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export const hasRole = (actual: Role | null | undefined, min: Role): boolean =>
    !!actual && ROLE_RANK[actual] >= ROLE_RANK[min];

export const ROLE_LABELS: Record<Role, string> = {
    owner: "Owner",
    admin: "Admin",
    editor: "Editor",
    viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
    owner: "Full control, including deleting the workspace",
    admin: "Manage members and connected accounts",
    editor: "Create and schedule posts",
    viewer: "Read-only access",
};

/** Roles that can be granted through an invitation or a role change. */
export const ASSIGNABLE_ROLES = ["admin", "editor", "viewer"] as const;
