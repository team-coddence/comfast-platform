// OpenAPI 3.1 description of the whole API, served by Swagger UI at /api/docs.
//
// Written as a plain object rather than JSDoc annotations scattered across the
// route files: the spec stays readable in one place, and it type-checks with
// the rest of the server instead of being parsed from comments at boot.
//
// Testing flow in the UI:
//   1. POST /api/auth/login (or /register) — copy the `token` from the response.
//   2. Click "Authorize", paste the token into bearerAuth.
//   3. GET /api/workspaces — copy a workspace `_id`.
//   4. Paste it into the "Authorize" X-Workspace-Id field, or into the
//      per-request header box. Every workspace-scoped endpoint then targets it.

import { env } from "../config/env.js";

const PLATFORMS = [
    "twitter", "linkedin", "facebook", "instagram", "tiktok",
    "facebook_page", "linkedin_page", "instagram_business",
];

const ROLES = ["owner", "admin", "editor", "viewer"];

const objectId = { type: "string", pattern: "^[a-f\\d]{24}$", example: "665f1a2b3c4d5e6f7a8b9c0d" } as const;

/** Standard error body, plus the machine-readable `code` on domain errors. */
const errorResponse = (description: string, code?: string) => ({
    description,
    content: {
        "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            ...(code ? { example: { code, message: description } } : {}),
        },
    },
})

const UNAUTHORIZED = errorResponse("Missing, malformed or expired bearer token");
const FORBIDDEN_WORKSPACE = errorResponse("You are not a member of the requested workspace", "WORKSPACE_FORBIDDEN");
const FORBIDDEN_ROLE = errorResponse("Your role in this workspace is too low for this action", "INSUFFICIENT_ROLE");

export const openApiSpec = {
    openapi: "3.1.0",
    info: {
        title: "Social Scheduler API",
        version: "1.0.0",
        description: [
            "Multi-tenant social media scheduling API.",
            "",
            "### Workspaces",
            "All content — connected accounts, posts, AI generations and activity — belongs to a **workspace**, never directly to a user. Every user gets a personal workspace at signup and can create or be invited into more.",
            "",
            "Workspace-scoped endpoints read the active workspace from the `X-Workspace-Id` header. Omit it and the server falls back to the caller's default workspace.",
            "",
            "### Roles",
            "`viewer` < `editor` < `admin` < `owner`. Each endpoint below documents its minimum role.",
            "",
            "### Testing here",
            "1. `POST /api/auth/login` and copy the `token`.",
            "2. **Authorize** → paste it into `bearerAuth`.",
            "3. `GET /api/workspaces` → copy a workspace `_id`.",
            "4. **Authorize** → paste that id into `workspaceId`.",
        ].join("\n"),
    },
    servers: [
        { url: env.backendUrl, description: "Configured backend" },
        { url: "http://localhost:3000", description: "Local development" },
    ],
    tags: [
        { name: "Auth", description: "Registration, login and the current user" },
        { name: "Workspaces", description: "Create, list, rename and delete workspaces" },
        { name: "Members", description: "Membership and roles within a workspace" },
        { name: "Invitations", description: "Invite people into a workspace by shareable link" },
        { name: "Accounts", description: "Connected social accounts, scoped to a workspace" },
        { name: "Social OAuth", description: "Connecting accounts through Zernio" },
        { name: "Posts", description: "Scheduling and AI generation" },
        { name: "Activity", description: "Workspace activity feed" },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
                description: "Paste the `token` returned by /api/auth/login or /api/auth/register.",
            },
            workspaceId: {
                type: "apiKey",
                in: "header",
                name: "X-Workspace-Id",
                description: "The active workspace id. Omit to use the caller's default workspace.",
            },
        },
        schemas: {
            Error: {
                type: "object",
                properties: {
                    message: { type: "string", description: "Human-readable explanation" },
                    code: { type: "string", description: "Stable machine-readable code, present on domain errors" },
                },
                required: ["message"],
            },
            User: {
                type: "object",
                properties: {
                    _id: objectId,
                    name: { type: "string", example: "Ada Lovelace" },
                    email: { type: "string", format: "email", example: "ada@example.com" },
                    avatarUrl: { type: "string", nullable: true },
                    provider: { type: "string", enum: ["local", "google", "twitter", "linkedin"] },
                    emailVerified: { type: "boolean" },
                },
            },
            AuthResponse: {
                type: "object",
                properties: {
                    _id: objectId,
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    defaultWorkspaceId: {
                        ...objectId,
                        description: "Bootstrap hint so the client can pick an active workspace without a round trip. GET /api/workspaces remains authoritative.",
                    },
                    token: { type: "string", description: "JWT, valid for 30 days" },
                },
            },
            Workspace: {
                type: "object",
                properties: {
                    _id: objectId,
                    name: { type: "string", example: "Acme Marketing" },
                    color: { type: "string", example: "#ef4444" },
                    isPersonal: { type: "boolean", description: "True for the workspace created automatically at signup" },
                    role: { type: "string", enum: ROLES, description: "The caller's role in this workspace" },
                    memberCount: { type: "integer", example: 3 },
                },
            },
            Member: {
                type: "object",
                properties: {
                    _id: objectId,
                    role: { type: "string", enum: ROLES },
                    joinedAt: { type: "string", format: "date-time" },
                    user: {
                        allOf: [{ $ref: "#/components/schemas/User" }],
                        nullable: true,
                        description: "Null when the underlying user account was deleted — render as 'Removed user'.",
                    },
                },
            },
            Invitation: {
                type: "object",
                properties: {
                    _id: objectId,
                    email: { type: "string", format: "email" },
                    role: { type: "string", enum: ["admin", "editor", "viewer"] },
                    status: { type: "string", enum: ["pending", "accepted", "revoked", "expired"] },
                    expiresAt: { type: "string", format: "date-time" },
                    isExpired: { type: "boolean" },
                    invitedBy: { $ref: "#/components/schemas/User" },
                    createdAt: { type: "string", format: "date-time" },
                },
            },
            InvitationCreated: {
                type: "object",
                properties: {
                    invitation: { $ref: "#/components/schemas/Invitation" },
                    inviteUrl: {
                        type: "string",
                        description: "The shareable link. Returned exactly once — only a hash of the token is stored, so it cannot be retrieved again. Use resend to issue a fresh link.",
                        example: "http://localhost:5173/invite/8Jd3...",
                    },
                },
            },
            Account: {
                type: "object",
                properties: {
                    _id: objectId,
                    workspace: objectId,
                    user: { allOf: [{ $ref: "#/components/schemas/User" }], description: "Who connected the account" },
                    platform: { type: "string", enum: PLATFORMS },
                    handle: { type: "string", example: "@acme" },
                    zernioAccountId: { type: "string" },
                    status: { type: "string", enum: ["connected", "disconnected"] },
                    avatarUrl: { type: "string", nullable: true },
                },
            },
            Post: {
                type: "object",
                properties: {
                    _id: objectId,
                    workspace: objectId,
                    user: { allOf: [{ $ref: "#/components/schemas/User" }], nullable: true, description: "The author" },
                    content: { type: "string" },
                    mediaUrl: { type: "string", nullable: true },
                    mediaType: { type: "string", enum: ["image", "video"], nullable: true },
                    platforms: { type: "array", items: { type: "string", enum: PLATFORMS } },
                    scheduledFor: { type: "string", format: "date-time" },
                    status: { type: "string", enum: ["draft", "scheduled", "published", "failed"] },
                },
            },
            Generation: {
                type: "object",
                properties: {
                    _id: objectId,
                    workspace: objectId,
                    user: objectId,
                    prompt: { type: "string" },
                    content: { type: "string" },
                    mediaUrl: { type: "string", nullable: true },
                    mediaType: { type: "string", enum: ["image", "video"], nullable: true },
                    tone: { type: "string", example: "professional" },
                },
            },
            ActivityLog: {
                type: "object",
                properties: {
                    _id: objectId,
                    workspace: objectId,
                    user: { $ref: "#/components/schemas/User" },
                    actionType: { type: "string", enum: ["POST_PUBLISHED", "AI_REPLY"] },
                    description: { type: "string" },
                    relatedPost: { type: "object", nullable: true, properties: { _id: objectId, content: { type: "string" } } },
                    createdAt: { type: "string", format: "date-time" },
                },
            },
        },
        parameters: {
            WorkspaceIdPath: {
                name: "workspaceId", in: "path", required: true, schema: objectId,
                description: "Takes precedence over the X-Workspace-Id header.",
            },
        },
    },
    // Applied to every operation unless overridden. Both schemes are optional
    // in effect: the token is required by `protect`, the header falls back to
    // the caller's default workspace when absent.
    security: [{ bearerAuth: [] }, { workspaceId: [] }],
    paths: {
        // ---------------------------------------------------------------- Auth
        "/api/auth/register": {
            post: {
                tags: ["Auth"], summary: "Create an account", security: [],
                description: "Also creates the user's personal workspace and makes them its owner.",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object", required: ["name", "email", "password"],
                                properties: {
                                    name: { type: "string", example: "Ada Lovelace" },
                                    email: { type: "string", format: "email", example: "ada@example.com" },
                                    password: { type: "string", format: "password", example: "correct-horse-battery" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: "Account created", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
                    400: errorResponse("Email already registered, or invalid data"),
                },
            },
        },
        "/api/auth/login": {
            post: {
                tags: ["Auth"], summary: "Sign in", security: [],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object", required: ["email", "password"],
                                properties: {
                                    email: { type: "string", format: "email", example: "ada@example.com" },
                                    password: { type: "string", format: "password" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Signed in", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
                    401: errorResponse("Invalid email or password"),
                },
            },
        },
        "/api/auth/me": {
            get: {
                tags: ["Auth"], summary: "The signed-in user", security: [{ bearerAuth: [] }],
                description: "Deliberately not workspace-scoped — the client calls this before it knows any workspace.",
                responses: {
                    200: { description: "The current user", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
                    401: UNAUTHORIZED,
                },
            },
        },
        "/api/auth/oauth/google": {
            get: {
                tags: ["Auth"], summary: "Start Google sign-in", security: [],
                description: "Browser redirect endpoint — not callable from Swagger UI. Ends at `{FRONTEND_URL}/auth/callback?token=…`.",
                responses: { 302: { description: "Redirect to Google" }, 503: errorResponse("Google sign-in is not configured on this server") },
            },
        },

        // ---------------------------------------------------------- Workspaces
        "/api/workspaces": {
            get: {
                tags: ["Workspaces"], summary: "List your workspaces", security: [{ bearerAuth: [] }],
                description: "Powers the workspace switcher. Returns every workspace the caller is a member of, with their role in each.",
                responses: {
                    200: { description: "Workspaces", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Workspace" } } } } },
                    401: UNAUTHORIZED,
                },
            },
            post: {
                tags: ["Workspaces"], summary: "Create a workspace", security: [{ bearerAuth: [] }],
                description: "The creator becomes its owner.",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object", required: ["name"],
                                properties: {
                                    name: { type: "string", maxLength: 60, example: "Acme Marketing" },
                                    color: { type: "string", example: "#3b82f6" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Workspace" } } } },
                    400: errorResponse("Missing or overlong name"),
                    401: UNAUTHORIZED,
                },
            },
        },
        "/api/workspaces/{workspaceId}": {
            parameters: [{ $ref: "#/components/parameters/WorkspaceIdPath" }],
            get: {
                tags: ["Workspaces"], summary: "Workspace detail", description: "**Minimum role:** viewer",
                responses: {
                    200: { description: "Workspace", content: { "application/json": { schema: { $ref: "#/components/schemas/Workspace" } } } },
                    401: UNAUTHORIZED, 403: FORBIDDEN_WORKSPACE,
                    404: errorResponse("Workspace not found", "WORKSPACE_NOT_FOUND"),
                },
            },
            patch: {
                tags: ["Workspaces"], summary: "Rename or recolour", description: "**Minimum role:** admin. Also mirrors the change to the linked Zernio profile.",
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { type: "object", properties: { name: { type: "string", maxLength: 60 }, color: { type: "string" } } } } },
                },
                responses: {
                    200: { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Workspace" } } } },
                    400: errorResponse("Nothing to update, or invalid name"),
                    401: UNAUTHORIZED, 403: FORBIDDEN_ROLE,
                },
            },
            delete: {
                tags: ["Workspaces"], summary: "Delete a workspace",
                description: "**Minimum role:** owner. Irreversible: disconnects every social account at Zernio, deletes the Zernio profile, then deletes all posts, generations, activity, memberships and invitations. Requires the workspace name as confirmation, and refuses if it is your only workspace.",
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { type: "object", required: ["confirmName"], properties: { confirmName: { type: "string", description: "Must match the workspace name exactly" } } } } },
                },
                responses: {
                    200: {
                        description: "Deleted",
                        content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" }, deleted: { type: "object" }, warnings: { type: "array", items: { type: "string" } } } } } },
                    },
                    400: errorResponse("Confirmation name did not match", "CONFIRMATION_REQUIRED"),
                    401: UNAUTHORIZED, 403: FORBIDDEN_ROLE,
                    409: errorResponse("This is your only workspace", "LAST_WORKSPACE"),
                },
            },
        },

        // ------------------------------------------------------------- Members
        "/api/workspaces/{workspaceId}/members": {
            parameters: [{ $ref: "#/components/parameters/WorkspaceIdPath" }],
            get: {
                tags: ["Members"], summary: "List members", description: "**Minimum role:** viewer",
                responses: {
                    200: { description: "Members", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Member" } } } } },
                    401: UNAUTHORIZED, 403: FORBIDDEN_WORKSPACE,
                },
            },
        },
        "/api/workspaces/{workspaceId}/members/{userId}": {
            parameters: [
                { $ref: "#/components/parameters/WorkspaceIdPath" },
                { name: "userId", in: "path", required: true, schema: objectId },
            ],
            patch: {
                tags: ["Members"], summary: "Change a member's role",
                description: "**Minimum role:** admin. Cannot target the owner, and cannot grant `owner` — use transfer-ownership for that.",
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { type: "object", required: ["role"], properties: { role: { type: "string", enum: ["admin", "editor", "viewer"] } } } } },
                },
                responses: {
                    200: { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Member" } } } },
                    400: errorResponse("Invalid role, or owner requested", "USE_TRANSFER_OWNERSHIP"),
                    401: UNAUTHORIZED,
                    403: errorResponse("Insufficient role, or the target is the owner", "CANNOT_MODIFY_OWNER"),
                    404: errorResponse("Member not found"),
                },
            },
            delete: {
                tags: ["Members"], summary: "Remove a member",
                description: "**Minimum role:** admin — except when removing yourself, which is allowed at any role and is equivalent to leaving. The member's posts and connected accounts stay in the workspace, and their scheduled posts keep publishing.",
                responses: {
                    200: { description: "Removed" },
                    401: UNAUTHORIZED,
                    403: errorResponse("Insufficient role, or the target is the owner", "CANNOT_MODIFY_OWNER"),
                    404: errorResponse("Member not found"),
                    409: errorResponse("You are the only owner", "LAST_OWNER"),
                },
            },
        },
        "/api/workspaces/{workspaceId}/leave": {
            parameters: [{ $ref: "#/components/parameters/WorkspaceIdPath" }],
            post: {
                tags: ["Members"], summary: "Leave a workspace",
                description: "**Minimum role:** viewer. Blocked for the sole owner — transfer ownership or delete the workspace instead. Ownership is never auto-assigned to another member.",
                responses: {
                    200: { description: "Left the workspace" },
                    401: UNAUTHORIZED, 403: FORBIDDEN_WORKSPACE,
                    409: errorResponse("You are the only owner", "LAST_OWNER"),
                },
            },
        },
        "/api/workspaces/{workspaceId}/transfer-ownership": {
            parameters: [{ $ref: "#/components/parameters/WorkspaceIdPath" }],
            post: {
                tags: ["Members"], summary: "Transfer ownership",
                description: "**Minimum role:** owner. Promotes the target to owner and demotes you to admin in the same operation.",
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { type: "object", required: ["userId"], properties: { userId: objectId } } } },
                },
                responses: {
                    200: { description: "Ownership transferred" },
                    400: errorResponse("Invalid or self-targeted userId"),
                    401: UNAUTHORIZED, 403: FORBIDDEN_ROLE,
                    404: errorResponse("That person is not a member of this workspace"),
                },
            },
        },

        // --------------------------------------------------------- Invitations
        "/api/workspaces/{workspaceId}/invitations": {
            parameters: [{ $ref: "#/components/parameters/WorkspaceIdPath" }],
            get: {
                tags: ["Invitations"], summary: "List invitations", description: "**Minimum role:** admin. Tokens are never returned — only their hash is stored.",
                responses: {
                    200: { description: "Invitations", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Invitation" } } } } },
                    401: UNAUTHORIZED, 403: FORBIDDEN_ROLE,
                },
            },
            post: {
                tags: ["Invitations"], summary: "Invite someone",
                description: "**Minimum role:** admin. Returns a shareable `inviteUrl` — send it however you like. The link expires in 7 days, is single-use, and only works for the invited email address.",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object", required: ["email"],
                                properties: {
                                    email: { type: "string", format: "email", example: "grace@example.com" },
                                    role: { type: "string", enum: ["admin", "editor", "viewer"], default: "editor" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: "Invitation created", content: { "application/json": { schema: { $ref: "#/components/schemas/InvitationCreated" } } } },
                    400: errorResponse("Invalid email or role"),
                    401: UNAUTHORIZED, 403: FORBIDDEN_ROLE,
                    409: errorResponse("Already a member, or an invitation is already pending", "ALREADY_MEMBER"),
                    429: errorResponse("Too many pending invitations for this workspace", "TOO_MANY_INVITES"),
                },
            },
        },
        "/api/workspaces/{workspaceId}/invitations/{inviteId}": {
            parameters: [
                { $ref: "#/components/parameters/WorkspaceIdPath" },
                { name: "inviteId", in: "path", required: true, schema: objectId },
            ],
            delete: {
                tags: ["Invitations"], summary: "Revoke an invitation",
                description: "**Minimum role:** admin. Soft revoke — the record stays for the audit trail, and the address can be invited again.",
                responses: {
                    200: { description: "Revoked" },
                    401: UNAUTHORIZED, 403: FORBIDDEN_ROLE,
                    404: errorResponse("No pending invitation found"),
                },
            },
        },
        "/api/workspaces/{workspaceId}/invitations/{inviteId}/resend": {
            parameters: [
                { $ref: "#/components/parameters/WorkspaceIdPath" },
                { name: "inviteId", in: "path", required: true, schema: objectId },
            ],
            post: {
                tags: ["Invitations"], summary: "Reissue an invitation link",
                description: "**Minimum role:** admin. Generates a **new** token and extends the expiry — the previous link stops working, which is the correct behaviour if it was mis-sent.",
                responses: {
                    200: { description: "New link issued", content: { "application/json": { schema: { $ref: "#/components/schemas/InvitationCreated" } } } },
                    401: UNAUTHORIZED, 403: FORBIDDEN_ROLE,
                    404: errorResponse("Invitation not found"),
                    409: errorResponse("That invitation has already been accepted", "INVITE_ALREADY_USED"),
                },
            },
        },
        "/api/invitations/{token}": {
            parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
            get: {
                tags: ["Invitations"], summary: "Preview an invitation", security: [],
                description: "Public, so the accept page renders for someone without an account yet. Returns no ids and only a masked email. Not-found, expired, revoked and accepted all return an identical 404 so the endpoint cannot distinguish them.",
                responses: {
                    200: {
                        description: "Invitation preview",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        workspaceName: { type: "string", example: "Acme Marketing" },
                                        workspaceColor: { type: "string" },
                                        inviterName: { type: "string", example: "Ada Lovelace" },
                                        role: { type: "string", enum: ["admin", "editor", "viewer"] },
                                        invitedEmail: { type: "string", example: "g***@example.com" },
                                        expiresAt: { type: "string", format: "date-time" },
                                    },
                                },
                            },
                        },
                    },
                    404: errorResponse("This invitation link is no longer valid", "INVITE_INVALID"),
                },
            },
        },
        "/api/invitations/{token}/accept": {
            parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
            post: {
                tags: ["Invitations"], summary: "Accept an invitation", security: [{ bearerAuth: [] }],
                description: "Requires sign-in but no workspace context — the caller is not a member yet. The signed-in account's email must match the invited address.",
                responses: {
                    200: {
                        description: "Joined",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        workspace: { $ref: "#/components/schemas/Workspace" },
                                        role: { type: "string", enum: ROLES },
                                        alreadyMember: { type: "boolean", description: "True when the caller had already joined by another route" },
                                    },
                                },
                            },
                        },
                    },
                    401: UNAUTHORIZED,
                    403: errorResponse("This invitation was sent to a different email address", "INVITE_EMAIL_MISMATCH"),
                    404: errorResponse("This invitation link is no longer valid", "INVITE_INVALID"),
                    409: errorResponse("This invitation has already been used", "INVITE_ALREADY_USED"),
                    410: errorResponse("This invitation has expired", "INVITE_EXPIRED"),
                },
            },
        },

        // ------------------------------------------------------------ Accounts
        "/api/accounts": {
            get: {
                tags: ["Accounts"], summary: "List connected accounts", description: "**Minimum role:** viewer. Scoped to the active workspace.",
                responses: {
                    200: { description: "Accounts", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Account" } } } } },
                    401: UNAUTHORIZED, 403: FORBIDDEN_WORKSPACE,
                },
            },
            post: {
                tags: ["Accounts"], summary: "Add an account manually", description: "**Minimum role:** admin. Normally accounts arrive through the OAuth sync instead.",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object", required: ["platform", "handle"],
                                properties: {
                                    platform: { type: "string", enum: PLATFORMS },
                                    handle: { type: "string", example: "@acme" },
                                    avatarUrl: { type: "string" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Account" } } } },
                    401: UNAUTHORIZED, 403: FORBIDDEN_ROLE,
                },
            },
        },
        "/api/accounts/platforms": {
            get: {
                tags: ["Accounts"], summary: "Platforms enabled on this deployment", security: [{ bearerAuth: [] }],
                description: "Deployment-wide configuration, identical in every workspace.",
                responses: {
                    200: { description: "Enabled platforms", content: { "application/json": { schema: { type: "object", properties: { platforms: { type: "array", items: { type: "string", enum: PLATFORMS } } } } } } },
                    401: UNAUTHORIZED,
                },
            },
        },
        "/api/accounts/{id}": {
            parameters: [{ name: "id", in: "path", required: true, schema: objectId }],
            delete: {
                tags: ["Accounts"], summary: "Disconnect an account", description: "**Minimum role:** admin. Also deletes the account at Zernio.",
                responses: {
                    200: { description: "Disconnected" },
                    401: UNAUTHORIZED, 403: FORBIDDEN_ROLE,
                    404: errorResponse("Account not found in this workspace"),
                    502: errorResponse("The publishing service could not be reached"),
                },
            },
        },

        // -------------------------------------------------------- Social OAuth
        "/api/oauth/{platform}/url": {
            parameters: [{ name: "platform", in: "path", required: true, schema: { type: "string", enum: PLATFORMS } }],
            get: {
                tags: ["Social OAuth"], summary: "Get a connect URL",
                description: "**Minimum role:** admin. Provisions the workspace's Zernio profile on first use, then returns the URL to send the browser to.",
                responses: {
                    200: { description: "Connect URL", content: { "application/json": { schema: { type: "object", properties: { url: { type: "string" } } } } } },
                    401: UNAUTHORIZED,
                    402: errorResponse("Zernio requires a payment method for this platform", "PAYMENT_REQUIRED"),
                    403: errorResponse("Insufficient role, or the platform is not enabled"),
                },
            },
        },
        "/api/oauth/sync": {
            get: {
                tags: ["Social OAuth"], summary: "Sync accounts from Zernio",
                description: "**Minimum role:** admin. Pulls the workspace's Zernio profile accounts and upserts them locally. Call after returning from a connect flow.",
                responses: {
                    200: { description: "Synced accounts", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Account" } } } } },
                    401: UNAUTHORIZED, 402: errorResponse("Zernio billing required", "PAYMENT_REQUIRED"), 403: FORBIDDEN_ROLE,
                },
            },
        },

        // --------------------------------------------------------------- Posts
        "/api/posts": {
            get: {
                tags: ["Posts"], summary: "List posts", description: "**Minimum role:** viewer. Every post in the active workspace, newest scheduled first.",
                responses: {
                    200: { description: "Posts", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Post" } } } } },
                    401: UNAUTHORIZED, 403: FORBIDDEN_WORKSPACE,
                },
            },
            post: {
                tags: ["Posts"], summary: "Schedule a post",
                description: "**Minimum role:** editor. Accepts JSON or multipart (with a `media` file). The in-process cron sweeps every minute and publishes posts whose `scheduledFor` has passed.",
                requestBody: {
                    required: true,
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object", required: ["content", "platforms", "scheduledFor"],
                                properties: {
                                    content: { type: "string", example: "Shipping something new today." },
                                    platforms: { type: "string", description: "JSON array or comma-separated list", example: '["twitter","linkedin"]' },
                                    scheduledFor: { type: "string", format: "date-time" },
                                    status: { type: "string", enum: ["draft", "scheduled"], default: "scheduled" },
                                    media: { type: "string", format: "binary", description: "Image or video, uploaded to Cloudinary" },
                                },
                            },
                        },
                        "application/json": {
                            schema: {
                                type: "object", required: ["content", "platforms", "scheduledFor"],
                                properties: {
                                    content: { type: "string" },
                                    platforms: { type: "array", items: { type: "string", enum: PLATFORMS } },
                                    scheduledFor: { type: "string", format: "date-time" },
                                    status: { type: "string", enum: ["draft", "scheduled"] },
                                    mediaUrl: { type: "string" },
                                    mediaType: { type: "string", enum: ["image", "video"] },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: "Scheduled", content: { "application/json": { schema: { $ref: "#/components/schemas/Post" } } } },
                    401: UNAUTHORIZED, 403: FORBIDDEN_ROLE,
                    503: errorResponse("Media upload is not available on this server"),
                },
            },
        },
        "/api/posts/generations": {
            get: {
                tags: ["Posts"], summary: "List AI generations", description: "**Minimum role:** viewer",
                responses: {
                    200: { description: "Generations", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Generation" } } } } },
                    401: UNAUTHORIZED, 403: FORBIDDEN_WORKSPACE,
                },
            },
        },
        "/api/posts/generate": {
            post: {
                tags: ["Posts"], summary: "Generate post copy with AI",
                description: "**Minimum role:** editor. Rate-limited to 30 calls per hour per user, because each one spends Gemini and Leonardo credits.",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object", required: ["prompt"],
                                properties: {
                                    prompt: { type: "string", example: "Announce our new analytics dashboard" },
                                    tone: { type: "string", example: "professional" },
                                    generateImage: { type: "boolean", default: false, description: "Also generate an image via Leonardo.ai and persist it to Cloudinary" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Generated", content: { "application/json": { schema: { $ref: "#/components/schemas/Generation" } } } },
                    401: UNAUTHORIZED, 403: FORBIDDEN_ROLE,
                    429: errorResponse("Hourly AI generation limit reached"),
                    503: errorResponse("AI post generation is not available on this server"),
                },
            },
        },

        // ------------------------------------------------------------ Activity
        "/api/activity": {
            get: {
                tags: ["Activity"], summary: "Recent workspace activity", description: "**Minimum role:** viewer. The 10 most recent entries.",
                responses: {
                    200: { description: "Activity", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/ActivityLog" } } } } },
                    401: UNAUTHORIZED, 403: FORBIDDEN_WORKSPACE,
                },
            },
        },
    },
} as const;
