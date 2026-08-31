/** Mirrors server/models/Post.ts, plus the populated `user` the API returns. */
export interface Post {
    _id: string;
    content: string;
    platforms: string[];
    mediaUrl?: string;
    mediaType?: "image" | "video";
    scheduledFor: string;
    status: PostStatus;
    createdAt: string;
    updatedAt: string;
    user?: { _id: string; name?: string; avatarUrl?: string };
}

export type PostStatus = "draft" | "scheduled" | "published" | "failed";

/** Kept in step with EDITABLE_STATUSES in server/controllers/postController.ts. */
export const isEditable = (post: Pick<Post, "status">): boolean => post.status !== "published";

export const STATUS_STYLES: Record<PostStatus, { label: string; chip: string; card: string; dot: string }> = {
    draft:     { label: "Draft",     chip: "bg-slate-100 text-slate-600 border-slate-200",       card: "bg-slate-50 border-slate-200 hover:border-slate-300",       dot: "bg-slate-400" },
    scheduled: { label: "Scheduled", chip: "bg-sky-50 text-sky-700 border-sky-100",             card: "bg-sky-50 border-sky-100 hover:border-sky-300",             dot: "bg-sky-500" },
    published: { label: "Published", chip: "bg-emerald-50 text-emerald-700 border-emerald-100", card: "bg-emerald-50 border-emerald-100 hover:border-emerald-300", dot: "bg-emerald-500" },
    failed:    { label: "Failed",    chip: "bg-red-50 text-red-700 border-red-100",             card: "bg-red-50 border-red-100 hover:border-red-300",             dot: "bg-red-500" },
};
