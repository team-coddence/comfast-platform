// Backfill: give every existing user a default workspace and stamp the
// workspace key onto all their existing data.
//
//   npm run migrate:workspaces -- --dry     preview, writes nothing
//   npm run migrate:workspaces              apply
//
// Safe to run repeatedly: every write is either an upsert or filtered on
// `workspace: {$exists: false}`, so a second run converges to zero changes.
// The only destructive act is dropping the stale {zernioAccountId, user} index
// on `accounts`, which syncIndexes() replaces with the workspace-scoped one.
//
// RUN THIS BEFORE serving traffic with the new server code. Until it completes,
// pre-existing posts and accounts have no `workspace` and will be invisible to
// the workspace-scoped queries.

import "../config/env.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { User } from "../models/User.js";
import { Account } from "../models/Account.js";
import { Post } from "../models/Post.js";
import { Generation } from "../models/Generation.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { Workspace } from "../models/Workspace.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { Invitation } from "../models/Invitation.js";
import { createDefaultWorkspace } from "../services/workspaceService.js";

const DRY = process.argv.includes("--dry");

const DATA_MODELS = [
    { name: "accounts", model: Account },
    { name: "posts", model: Post },
    { name: "generations", model: Generation },
    { name: "activitylogs", model: ActivityLog },
] as const;

const log = (message: string) => console.log(`${DRY ? "[dry] " : ""}${message}`);

const run = async () => {
    await connectDB();

    if (DRY) console.log("\n=== DRY RUN — no writes will be performed ===");
    console.log("\n--- Step 1: default workspace per user ---");

    const users = await User.find().select("_id name email zernioProfileId");
    const workspaceByUser = new Map<string, mongoose.Types.ObjectId>();
    let created = 0;
    let adopted = 0;

    for (const user of users) {
        const key = user._id.toString();
        const existing = await Workspace.findOne({ owner: user._id, isPersonal: true }).select("_id");

        if (existing) {
            workspaceByUser.set(key, existing._id);
            adopted += 1;
            continue;
        }

        if (DRY) {
            // Nothing to record — the stamping step below reports "would stamp"
            // counts against a workspace that does not exist yet.
            created += 1;
            continue;
        }

        const workspace = await createDefaultWorkspace(user);
        workspaceByUser.set(key, workspace._id);
        created += 1;
    }

    log(`users: ${users.length} · workspaces created: ${created} · already present: ${adopted}`);

    console.log("\n--- Step 2: stamp workspace onto existing data ---");

    const stamped: Record<string, number> = {};

    for (const { name, model } of DATA_MODELS) {
        let total = 0;

        for (const user of users) {
            const workspaceId = workspaceByUser.get(user._id.toString());
            const filter = { user: user._id, workspace: { $exists: false } };

            if (!workspaceId) {
                // Dry run, or a user whose workspace creation failed.
                total += await (model as any).countDocuments(filter);
                continue;
            }

            const result = await (model as any).updateMany(filter, { $set: { workspace: workspaceId } });
            total += result.modifiedCount ?? 0;
        }

        stamped[name] = total;
        log(`${name}: ${total} document(s) ${DRY ? "would be" : ""} stamped`);
    }

    console.log("\n--- Step 3: orphan sweep ---");

    // Documents whose `user` no longer exists. Reported, never deleted — that
    // is a judgement call for a human, not a migration script.
    let orphans = 0;
    for (const { name, model } of DATA_MODELS) {
        const count = await (model as any).countDocuments({ workspace: { $exists: false } });
        const remaining = DRY ? Math.max(0, count - (stamped[name] ?? 0)) : count;
        if (remaining > 0) console.warn(`  ! ${name}: ${remaining} document(s) with no resolvable owner`);
        orphans += remaining;
    }
    if (orphans === 0) console.log("  none");

    console.log("\n--- Step 4: indexes ---");

    if (DRY) {
        log("would run syncIndexes() on all models (drops the stale accounts {zernioAccountId, user} index)");
    } else {
        // Must run AFTER step 2: the new {zernioAccountId, workspace} unique
        // index would otherwise collide across every doc still holding
        // `workspace: undefined`.
        // User is included to replace the broken sparse {provider, providerSub}
        // unique index, which prevented more than one local account existing.
        for (const model of [User, Account, Post, Generation, ActivityLog, Workspace, WorkspaceMember, Invitation]) {
            const dropped = await (model as any).syncIndexes();
            console.log(`  ${(model as any).modelName}: synced${dropped?.length ? ` (dropped ${dropped.join(", ")})` : ""}`);
        }
    }

    console.log("\n--- Summary ---");
    console.log(`  users processed      ${users.length}`);
    console.log(`  workspaces created   ${created}`);
    console.log(`  workspaces adopted   ${adopted}`);
    for (const { name } of DATA_MODELS) console.log(`  ${name.padEnd(20)} ${stamped[name] ?? 0}`);
    console.log(`  orphaned documents   ${orphans}`);

    await mongoose.disconnect();

    if (orphans > 0 && !DRY) {
        console.error("\nMigration finished with unresolved orphans — review them before deploying.");
        process.exit(1);
    }

    console.log(DRY ? "\nDry run complete. Re-run without --dry to apply.\n" : "\nMigration complete.\n");
}

run().catch(async (error) => {
    console.error("\nMigration failed:", error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
