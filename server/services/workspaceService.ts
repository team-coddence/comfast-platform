import { Workspace } from "../models/Workspace.js";
import { WorkspaceMember, type Role } from "../models/WorkspaceMember.js";
import zernio from "../config/zernio.js";
import { logError } from "../utils/redact.js";

// Every workspace lifecycle operation lives here so signup, the OAuth callback,
// the API and the backfill script all share one implementation.
//
// There are no transactions available: the deployment target is a standalone
// MongoDB (see docker-compose.yml), where session.withTransaction throws. So
// instead of rolling back on partial failure, every write below is either an
// upsert or guarded by a unique index, and the ordering is chosen so that a
// crash mid-way leaves a harmless state that the next call repairs.

interface CreateWorkspaceOptions {
    name: string;
    color?: string;
    isPersonal?: boolean;
}

/**
 * Creates a workspace and its owner membership.
 *
 * Ordering is load-bearing: the Workspace is created first. A crash between the
 * two writes leaves an ownerless workspace, which is invisible (nothing queries
 * workspaces except through memberships) and gets adopted by the next retry.
 * The reverse order would leave a membership pointing at a workspace that does
 * not exist — which is precisely the state that 404s a user's dashboard.
 */
export const createWorkspace = async (user: any, { name, color, isPersonal = false }: CreateWorkspaceOptions) => {
    const workspace = await Workspace.create({
        name,
        color,
        owner: user._id,
        isPersonal,
        // Carried over so a pre-existing Zernio profile keeps owning its
        // connected accounts. Nothing has to be reconnected.
        zernioProfileId: user.zernioProfileId || undefined,
    })

    const membership = await ensureOwnerMembership(workspace._id, user._id);
    return { workspace, membership };
}

const ensureOwnerMembership = async (workspaceId: any, userId: any) =>
    WorkspaceMember.findOneAndUpdate(
        { workspace: workspaceId, user: userId },
        { $set: { role: "owner" }, $setOnInsert: { joinedAt: new Date() } },
        { upsert: true, returnDocument: 'after' }
    )

/**
 * The workspace every user gets at signup. Idempotent: the unique partial index
 * on {owner, isPersonal} means a concurrent or repeated call adopts the
 * existing workspace instead of creating a second one.
 */
export const createDefaultWorkspace = async (user: any) => {
    const existing = await Workspace.findOne({ owner: user._id, isPersonal: true });
    if (existing) {
        await ensureOwnerMembership(existing._id, user._id);
        return existing;
    }

    try {
        const { workspace } = await createWorkspace(user, {
            name: `${user.name || user.email}'s Workspace`,
            isPersonal: true,
        });
        return workspace;
    } catch (error: any) {
        // Lost a race against a concurrent signup path — adopt the winner.
        if (error?.code === 11000) {
            const winner = await Workspace.findOne({ owner: user._id, isPersonal: true });
            if (winner) {
                await ensureOwnerMembership(winner._id, user._id);
                return winner;
            }
        }
        throw error;
    }
}

/**
 * Returns some workspace the user can work in, creating their default one if
 * they have none. This is the self-healing backstop: it repairs users who
 * predate the feature and users whose signup-time creation failed, so nobody
 * can ever land on a broken dashboard.
 */
export const ensureWorkspaceForUser = async (user: any) => {
    const membership = await WorkspaceMember.findOne({ user: user._id })
        .sort({ updatedAt: -1 })
        .populate("workspace");

    if (membership?.workspace) return membership.workspace as any;

    return createDefaultWorkspace(user);
}

/** Every workspace the user belongs to, with their role in each. */
export const listWorkspacesForUser = async (userId: any) => {
    const memberships = await WorkspaceMember.find({ user: userId })
        .sort({ updatedAt: -1 })
        .populate("workspace");

    // A membership whose workspace was deleted is an orphan; skip rather than
    // emitting a null entry the client would have to defend against.
    return memberships
        .filter((m) => m.workspace)
        .map((m) => {
            const w = m.workspace as any;
            return {
                _id: w._id,
                name: w.name,
                color: w.color,
                isPersonal: w.isPersonal,
                owner: w.owner,
                role: m.role as Role,
                joinedAt: m.joinedAt,
            };
        });
}

/**
 * Lazily provisions the workspace's Zernio profile — Zernio's own tenancy unit,
 * and what keeps connected accounts separated between workspaces.
 *
 * Deliberately not called at workspace creation: that would put a third-party
 * network call (and a possible 402 billing error) inside the signup path.
 */
export const getOrCreateZernioProfile = async (workspace: any): Promise<string> => {
    if (workspace.zernioProfileId) return workspace.zernioProfileId;

    const createResult = await zernio.profiles.createProfile({
        body: {
            name: workspace.name,
            description: `social-scheduler workspace ${workspace._id}`,
            color: workspace.color,
        } as any,
    })
    const created = (createResult.data as any)?.profile || createResult.data;
    const pid = created?._id || created?.id;

    if (!pid) throw new Error("Failed to create Zernio profile — no ID returned");

    // Conditional update: if two connects race on a fresh workspace, only one
    // write lands. The loser deletes the profile it just created rather than
    // leaking a second (potentially billable) profile at Zernio.
    const claimed = await Workspace.findOneAndUpdate(
        // `field: null` matches both an explicit null and a missing field.
        { _id: workspace._id, zernioProfileId: null },
        { $set: { zernioProfileId: pid } },
        { returnDocument: 'after' }
    )

    if (!claimed) {
        try {
            await zernio.profiles.deleteProfile({ path: { profileId: pid } as any });
        } catch (error) {
            logError("Failed to clean up duplicate Zernio profile", error);
        }
        const winner = await Workspace.findById(workspace._id);
        return winner!.zernioProfileId!;
    }

    workspace.zernioProfileId = pid;
    return pid;
}
