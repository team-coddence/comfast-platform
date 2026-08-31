import { Response } from "express";
import mongoose from "mongoose";
import { WorkspaceRequest } from "../middlewares/workspaceMiddleware.js";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import { cloudinary, isCloudinaryConfigured } from "../config/cloudinary.js";
import { Generation } from "../models/Generation.js";
import { Post } from "../models/Post.js";
import { env } from "../config/env.js";
import { logError } from "../utils/redact.js";


// Helper to poll Leonardo.ai
const pollLeonardoJob = async (generationId: string, apiKey: string) : Promise<string>=>{
    const maxRetries = 20;
    const delay = 5000;

    for(let i = 0; i < maxRetries; i++){
        try {
           const response = await axios.get(`https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`, {headers: {
            accept: "application/json", authorization: `Bearer ${apiKey}`
           }}) 

           const generation = response.data.generations_by_pk;
           if(generation.status === "COMPLETE"){
            if(generation.generated_images && generation.generated_images.length > 0){
                return generation.generated_images[0].url;
            }
            throw new Error("Generation complete but no images found.")
           }
           if(generation.status === "FAILED"){
            throw new Error("Leonardo.ai generation failed.")
           }
        } catch (err: any) {
            // Leonardo echoes the Authorization header back in some error
            // payloads, so this must not be logged raw.
            logError("Leonardo polling error", err?.response?.data || err);
        }

        await new Promise((resolve)=> setTimeout(resolve, delay));
    }
    throw new Error("Leonardo.ai generation timed out.")
}

// Generate post
// POST /api/posts/generate
export const generatePost = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const { prompt, tone, generateImage } = req.body;

        const apiKey = env.geminiApiKey;
        if(!apiKey){
            // 503, not 400 — nothing is wrong with the client's request. The
            // message stays generic: server-side file layout is not the
            // caller's business.
            res.status(503).json({message: "AI post generation is not available on this server." });
            return;
        }

        const ai = new GoogleGenAI({apiKey});

        // Generate Text
        const textResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Generate a social media post based on this prompt: "${prompt}". 
            Tone: ${tone}. 
            Include relevant hashtags.
            Format the response as JSON with "content" and "imagePrompt" fields. 
            The "imagePrompt" should be a highly descriptive prompt for an image generator that complements the post.`,
        });

        let content = "";
        let imagePrompt = prompt;

        try {
            const rawText = textResponse.text || "";
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {content: rawText, imagePrompt: prompt};
            content = data.content;
            imagePrompt = data.imagePrompt;
        } catch (e) {
            content = textResponse.text || ""
        }

        let mediaUrl = "";
        if(generateImage){
           try {
            const leonardoKey = env.leonardoApiKey;
            // Both keys are needed: Leonardo generates the image, Cloudinary
            // persists it before Leonardo's temporary URL expires.
            if(leonardoKey && isCloudinaryConfigured()){
                // Use Leonardo.ai for image generation
                const leoResponse = await axios.post(
                    "https://cloud.leonardo.ai/api/rest/v2/generations",
                    {
                        "public": false,
                        "model": "gpt-image-2",
                        "parameters": {
                            "quality": "LOW",
                            "prompt": imagePrompt,
                            "quantity": 1,
                            "width": 1024,
                            "height": 1024,
                            "prompt_enhance": "OFF"
                        }
                    },{
                        headers:{
                            accept: "application/json",
                            authorization: `Bearer ${leonardoKey}`,
                            "content-type": "application/json",
                        }
                    }
                )

                const generationId = leoResponse.data.generate.generationId;
                const tempUrl = await pollLeonardoJob(generationId, leonardoKey);

                // Upload to Cloudinary for persistence
                const uploadResult = await cloudinary.uploader.upload(tempUrl, {
                    // Namespaced per workspace so a future workspace deletion
                    // can clean up its assets in one call.
                    folder: `ai-generations/${req.workspace._id}`,
                });
                mediaUrl = uploadResult.secure_url;
            }
           } catch (err: any) {
                logError("Image generation failed", err);
           }
        }

         // Save generation to DB
          const generation = await Generation.create({
            workspace: req.workspace._id,
            user: req.user._id,
            prompt,
            content,
            mediaUrl,
            mediaType: mediaUrl ? "image" : undefined,
            tone
          })

          res.json(generation)
        
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}


// Statuses a post can be edited or rescheduled in. `published` is excluded:
// the copy is already out on the networks, so a local edit would silently
// diverge from what people actually see.
const EDITABLE_STATUSES = ["draft", "scheduled", "failed"] as const;

/**
 * Uploads `file` to Cloudinary and returns the persisted url and resource kind.
 * Throws if Cloudinary is not configured — callers turn that into a 503.
 */
const uploadMedia = async (file: Express.Multer.File, workspaceId: any): Promise<{ mediaUrl: string, mediaType: "image" | "video" }> => {
    const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ resource_type: "auto", folder: `social-scheduler/${workspaceId}` }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
        stream.end(file.buffer);
    });
    return { mediaUrl: result.secure_url, mediaType: result.resource_type === "video" ? "video" : "image" };
}

/** FormData cannot carry arrays, so `platforms` arrives as a JSON string or a CSV. */
const parsePlatforms = (platforms: any) => {
    if (typeof platforms !== "string") return platforms;
    try {
        return JSON.parse(platforms);
    } catch {
        return platforms.split(",").map((p) => p.trim()).filter(Boolean);
    }
}

/** Multipart turns every value into a string, `"false"` included. */
const parseBool = (value: any) => value === true || value === "true";

// Get generations
// GET /api/posts/generations
export const getGenerations = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const generations = await Generation.find({workspace: req.workspace._id}).sort({createdAt: -1})
        res.json(generations)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}


// Get posts
// GET /api/posts?from=&to=&status=
export const getPosts = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const { from, to, status } = req.query as Record<string, string | undefined>;

        const filter: Record<string, any> = { workspace: req.workspace._id };

        // The calendar asks for one week at a time. Both bounds are optional so
        // callers that want the whole queue keep working unchanged.
        const range: Record<string, Date> = {};
        if (from && !isNaN(Date.parse(from))) range.$gte = new Date(from);
        if (to && !isNaN(Date.parse(to))) range.$lt = new Date(to);
        if (Object.keys(range).length) filter.scheduledFor = range;

        if (status) filter.status = { $in: status.split(",").map((s) => s.trim()).filter(Boolean) };

        const posts = await Post.find(filter)
            .sort({scheduledFor: -1})
            .populate("user", "name avatarUrl")
        res.json(posts)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}


// Get one post
// GET /api/posts/:id
export const getPost = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            res.status(404).json({ code: "POST_NOT_FOUND", message: "Post not found" });
            return;
        }

        // Scoped to the workspace, not the author: any member may open any post
        // in a workspace they belong to.
        const post = await Post.findOne({ _id: req.params.id, workspace: req.workspace._id })
            .populate("user", "name avatarUrl");

        if (!post) {
            res.status(404).json({ code: "POST_NOT_FOUND", message: "Post not found" });
            return;
        }
        res.json(post)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}


// Schedule post
// POST /api/posts
export const schedulePost = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const { content, platforms, scheduledFor, status } = req.body;

        let mediaUrl: string | undefined = req.body.mediaUrl;
        let mediaType: "image" | "video" | undefined = req.body.mediaType;

        if(req.file){
            if(!isCloudinaryConfigured()){
                res.status(503).json({ message: "Media upload is not available on this server." });
                return;
            }
            ({ mediaUrl, mediaType } = await uploadMedia(req.file, req.workspace._id));
        }

        const post = await Post.create({
            workspace: req.workspace._id,
            user: req.user._id,
            content,
            platforms: parsePlatforms(platforms),
            mediaUrl,
            mediaType,
            scheduledFor,
            status,
        })
        res.status(201).json(post)

    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}


// Update a scheduled post
// PATCH /api/posts/:id
export const updatePost = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            res.status(404).json({ code: "POST_NOT_FOUND", message: "Post not found" });
            return;
        }

        const { content, platforms, scheduledFor, status, removeMedia } = req.body;

        // Only the keys the caller actually sent are touched, so the calendar
        // can drag a post to a new slot without resending its whole body.
        const update: Record<string, any> = {};
        if (content !== undefined) update.content = content;
        if (platforms !== undefined) update.platforms = parsePlatforms(platforms);
        if (scheduledFor !== undefined) {
            if (isNaN(Date.parse(scheduledFor))) {
                res.status(400).json({ message: "scheduledFor must be a valid date" });
                return;
            }
            update.scheduledFor = new Date(scheduledFor);
        }
        if (status !== undefined) {
            // Re-queueing a failed post is allowed; marking one published by
            // hand is not — only the cron may do that, after it really posted.
            if (!["draft", "scheduled"].includes(status)) {
                res.status(400).json({ message: "status must be draft or scheduled" });
                return;
            }
            update.status = status;
        }

        if (req.file) {
            if (!isCloudinaryConfigured()) {
                res.status(503).json({ message: "Media upload is not available on this server." });
                return;
            }
            const uploaded = await uploadMedia(req.file, req.workspace._id);
            update.mediaUrl = uploaded.mediaUrl;
            update.mediaType = uploaded.mediaType;
        } else if (parseBool(removeMedia)) {
            update.mediaUrl = undefined;
            update.mediaType = undefined;
        } else if (req.body.mediaUrl !== undefined) {
            update.mediaUrl = req.body.mediaUrl;
            update.mediaType = req.body.mediaType;
        }

        // `status` is part of the filter, not just the guard, so a post the
        // cron publishes between our read and our write is never overwritten.
        const post = await Post.findOneAndUpdate(
            { _id: req.params.id, workspace: req.workspace._id, status: { $in: EDITABLE_STATUSES } },
            { $set: update },
            { new: true, runValidators: true },
        ).populate("user", "name avatarUrl");

        if (!post) {
            // Distinguish "gone" from "too late to edit" — the client shows
            // very different things for the two.
            const exists = await Post.exists({ _id: req.params.id, workspace: req.workspace._id });
            if (exists) {
                res.status(409).json({ code: "POST_ALREADY_PUBLISHED", message: "This post has already been published and can no longer be edited." });
            } else {
                res.status(404).json({ code: "POST_NOT_FOUND", message: "Post not found" });
            }
            return;
        }

        res.json(post)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}


// Delete a post
// DELETE /api/posts/:id
export const deletePost = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            res.status(404).json({ code: "POST_NOT_FOUND", message: "Post not found" });
            return;
        }

        // Published posts may be removed too, but only from this queue — the
        // copy already live on the networks is not retracted.
        const post = await Post.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });

        if (!post) {
            res.status(404).json({ code: "POST_NOT_FOUND", message: "Post not found" });
            return;
        }

        res.json({ message: "Post deleted", _id: post._id })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}
