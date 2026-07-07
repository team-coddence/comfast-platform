import cron from "node-cron";
import { Post } from "../models/Post.js";
import { Account } from "../models/Account.js";
import zernio from "../config/zernio.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { platform } from "node:os";

export const initScheduler = ()=>{
    cron.schedule("* * * * *", async ()=>{
        try {
            const now = new Date();
            const postsToPublish = await Post.find({status: "scheduled", scheduledFor: {$lte: now}});

            for (const post of postsToPublish) {
                try {
                    const accounts = await Account.find({
                        user: post.user,
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
                        user: post.user,
                        actionType: "POST_PUBLISHED",
                        description: `Published post to ${accounts.map((a) => a.platform).join(", ")} `,
                        relatedPost: post._id,
                    })
                    
                } catch (err: any) {
                    console.error(`Failed to publish post ${post._id} :`, err?.response?.data || err?.message);
                    post.status = "failed";
                    await post.save();
                }
            }
            if(postsToPublish.length > 0){
                console.log(`Evaluated ${postsToPublish.length} posts at ${now.toISOString()}`);
            }
        } catch (error) {
            console.error("Error in scheduler:", error);
        }
    })
     console.log("Scheduler service initialized.");
}