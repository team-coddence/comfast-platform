import cron from "node-cron";
import { Post } from "../models/Post.js";
import { Account } from "../models/Account.js";
import zernio from "../config/zernio.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { logError } from "../utils/redact.js";
import { ensureWorkspaceForUser } from "./workspaceService.js";
import { Workspace } from "../models/Workspace.js";
import { getSubscriptionState } from "./subscriptionService.js";

// How long a post waits for its workspace to renew before it is given up on.
// Publishing a two-day-old post the moment someone pays is worse than failing
// it: the content is stale and the customer did not ask for it to go out now.
const UNPAID_HOLD_HOURS = 24;

export const initScheduler = ()=>{
    cron.schedule("* * * * *", async ()=>{
        try {
            const now = new Date();
            const postsToPublish = await Post.find({status: "scheduled", scheduledFor: {$lte: now}});

            for (const post of postsToPublish) {
                try {
                    // Legacy posts written before workspaces exist have no
                    // `workspace`. Querying with `undefined` silently matches
                    // nothing, which would leave them stuck as "scheduled"
                    // forever rather than failing visibly. Resolve the author's
                    // workspace instead. Remove once the backfill has been
                    // verified in every environment.
                    const workspace = post.workspace
                        ? await Workspace.findById(post.workspace)
                        : await ensureWorkspaceForUser({_id: post.user});

                    if(!workspace){
                        console.log(`Post ${post._id} belongs to a workspace that no longer exists`);
                        post.status = "failed";
                        await post.save();
                        continue;
                    }
                    const workspaceId = workspace._id;

                    // The paywall applies at publish time too, not only at
                    // scheduling time: a post queued during the trial must not
                    // publish for free a week after the trial ended.
                    const subscription = await getSubscriptionState(workspace);
                    if(!subscription.isActive){
                        const heldFor = now.getTime() - post.scheduledFor.getTime();
                        if(heldFor > UNPAID_HOLD_HOURS * 60 * 60 * 1000){
                            console.log(`Post ${post._id} failed: workspace ${workspaceId} has no active subscription`);
                            post.status = "failed";
                            await post.save();
                        }
                        // Otherwise leave it scheduled — paying within the day
                        // publishes it on the next sweep.
                        continue;
                    }

                    const accounts = await Account.find({
                        workspace: workspaceId,
                        platform: {$in: post.platforms},
                        status: "connected",
                        zernioAccountId: {$exists: true}
                    })

                    if(accounts.length === 0){
                        console.log(`No connected Zernio accounts found for post ${post._id}`);
                        continue;
                    }
                    const zernioPlatforms = accounts.map((acc)=>{
                        const target: any = {
                            platform: acc.platform as any,
                            accountId: acc.zernioAccountId!,
                        }
                        // TikTok direct posts require a privacy level and interaction
                        // settings. SELF_ONLY is the universally-allowed option and the
                        // only one permitted while the app is in TikTok's unaudited mode.
                        if(acc.platform === "tiktok"){
                            target.platformSpecificData = {
                                privacyLevel: "SELF_ONLY",
                                allowComment: true,
                                allowDuet: true,
                                allowStitch: true,
                            }
                        }
                        return target;
                    })

                    const payload = {
                        content: post.content,
                        publishNow: true,
                        ...(post.mediaUrl ? {mediaItems: [{type: post.mediaType || "image", url: post.mediaUrl}]} : {}),
                        platforms: zernioPlatforms,
                    }

                    console.log(`Publishing post ${post._id} to Zernio with media: ${post.mediaUrl || "none"}`)

                    const response = await zernio.posts.createPost({
                        body: payload
                    })

                    const publishedPost = (response.data as any)?.post || response.data;

                    if(!publishedPost){
                        throw new Error("Failed to get post object from Zernio response");
                    }

                    console.log(`Zernio post created: ${publishedPost._id || publishedPost.id}`);

                    post.status = "published";
                    await post.save();

                    await ActivityLog.create({
                        workspace: workspaceId,
                        // Kept so the activity feed can still attribute the post
                        // to its author.
                        user: post.user,
                        actionType: "POST_PUBLISHED",
                        description: `Published post to ${accounts.map((a) => a.platform).join(", ")} `,
                        relatedPost: post._id,
                    })
                    
                } catch (err: any) {
                    logError(`Failed to publish post ${post._id}`, err?.response?.data || err);
                    post.status = "failed";
                    await post.save();
                }
            }
            if(postsToPublish.length > 0){
                console.log(`Evaluated ${postsToPublish.length} posts at ${now.toISOString()}`);
            }
        } catch (error) {
            logError("Error in scheduler", error);
        }
    })
     console.log("Scheduler service initialized.");
}