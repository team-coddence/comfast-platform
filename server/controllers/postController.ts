import { Response } from "express";
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
// GET /api/posts
export const getPosts = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const posts = await Post.find({workspace: req.workspace._id})
            .sort({scheduledFor: -1})
            .populate("user", "name avatarUrl")
        res.json(posts)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}


// Schedule post
// POST /api/posts
export const schedulePost = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const { content, platforms, scheduledFor, status } = req.body;

        // Parse platforms if it comes as a stringified array from FormData
        let parsedPlatforms = platforms;
        if(typeof platforms === "string"){
            try {
                parsedPlatforms = JSON.parse(platforms)
            } catch (e) {
                parsedPlatforms = platforms.split(",");
            }
        }

        let mediaUrl: string | undefined = req.body.mediaUrl;
        let mediaType: "image" | "video" | undefined = req.body.mediaType;

        if(req.file){
            if(!isCloudinaryConfigured()){
                res.status(503).json({ message: "Media upload is not available on this server." });
                return;
            }
            const result = await new Promise<any>((resolve, reject)=>{
                const stream = cloudinary.uploader.upload_stream({resource_type: "auto", folder: `social-scheduler/${req.workspace._id}`}, (error, result)=>{
                    if(error) reject(error);
                    else resolve(result)
                });
                stream.end(req.file!.buffer);
            });
            mediaUrl = result.secure_url;
            mediaType = result.resource_type === "video" ? "video" : "image";
        }

        const post = await Post.create({
            workspace: req.workspace._id,
            user: req.user._id,
            content,
            platforms: parsedPlatforms,
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