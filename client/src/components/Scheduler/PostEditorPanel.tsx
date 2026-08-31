import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, ClockIcon, Loader2Icon, Trash2Icon, XIcon } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../api/axios";
import { useEnabledPlatforms } from "../../hooks/useEnabledPlatforms";
import { isEditable, STATUS_STYLES, type Post } from "../../lib/posts";
import { toDateInput, toTimeInput, fromDateTimeInputs } from "../../lib/calendar";

interface Props {
    /** The post being edited, or null when composing a new one. */
    post: Post | null;
    /** Slot the user clicked in the grid — seeds date and time in create mode. */
    slot: Date | null;
    onClose: () => void;
    onSaved: () => void;
    /** False for viewers: the panel still opens, but read-only. */
    canEdit: boolean;
}

/** Platforms the networks reject without an attachment. */
const MEDIA_REQUIRED = ["instagram", "tiktok"];

const PostEditorPanel = ({ post, slot, onClose, onSaved, canEdit }: Props) => {
    const enabledPlatforms = useEnabledPlatforms();

    const [content, setContent] = useState("");
    const [platforms, setPlatforms] = useState<string[]>([]);
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [status, setStatus] = useState<"draft" | "scheduled">("scheduled");
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    /** The already-uploaded media, cleared when the user detaches it. */
    const [existingMedia, setExistingMedia] = useState<{ url: string; type?: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Published posts are immutable server-side, so the panel shows them but
    // offers no controls beyond Delete.
    const readOnly = !canEdit || (post !== null && !isEditable(post));

    // Re-seed whenever the panel is pointed at a different post or slot.
    useEffect(() => {
        const when = post ? new Date(post.scheduledFor) : (slot ?? new Date());
        setContent(post?.content ?? "");
        setPlatforms(post?.platforms ?? []);
        setDate(toDateInput(when));
        setTime(toTimeInput(when));
        setStatus(post && post.status === "draft" ? "draft" : "scheduled");
        setExistingMedia(post?.mediaUrl ? { url: post.mediaUrl, type: post.mediaType } : null);
        setMediaFile(null);
        setConfirmDelete(false);
    }, [post, slot]);

    // The object URL is revoked on teardown; without that every new selection
    // would pin its file in memory for the life of the page.
    const filePreview = useMemo(() => (mediaFile ? URL.createObjectURL(mediaFile) : null), [mediaFile]);
    useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview) }, [filePreview]);

    const togglePlatform = (id: string) =>
        setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

    const hasMedia = Boolean(mediaFile || existingMedia);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (readOnly) return;

        if (platforms.length === 0) {
            toast.error("Select at least one platform");
            return;
        }
        if (!date || !time) {
            toast.error("Select date and time");
            return;
        }
        const missingMedia = MEDIA_REQUIRED.filter((p) => platforms.includes(p));
        if (missingMedia.length > 0 && !hasMedia) {
            toast.error(`${missingMedia.join(" and ")} require an image or video`);
            return;
        }

        const scheduledFor = fromDateTimeInputs(date, time);
        if (isNaN(scheduledFor.getTime())) {
            toast.error("That date and time is not valid");
            return;
        }

        const formData = new FormData();
        formData.append("content", content);
        formData.append("scheduledFor", scheduledFor.toISOString());
        formData.append("status", status);
        formData.append("platforms", JSON.stringify(platforms));
        if (mediaFile) formData.append("media", mediaFile);
        // Only meaningful on edit: tells the server to detach media the post
        // arrived with but no longer shows.
        else if (post?.mediaUrl && !existingMedia) formData.append("removeMedia", "true");

        setSaving(true);
        try {
            if (post) {
                await api.patch(`/api/posts/${post._id}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
                toast.success("Post updated");
            } else {
                await api.post("/api/posts", formData, { headers: { "Content-Type": "multipart/form-data" } });
                toast.success("Post scheduled");
            }
            onSaved();
            onClose();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error.message);
        } finally {
            setSaving(false);
        }
    }

    const handleDelete = async () => {
        if (!post || !canEdit) return;
        // Two-step rather than a window.confirm, which the rest of the app avoids.
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }
        setDeleting(true);
        try {
            await api.delete(`/api/posts/${post._id}`);
            toast.success("Post deleted");
            onSaved();
            onClose();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error.message);
        } finally {
            setDeleting(false);
        }
    }

    const statusStyle = post ? STATUS_STYLES[post.status] : null;

    return (
        <aside className="w-full lg:w-[380px] shrink-0 bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-8rem)] lg:sticky lg:top-6">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                <h2 className="text-slate-900">{post ? "Edit Post" : "New Post"}</h2>
                {statusStyle && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusStyle.chip}`}>{statusStyle.label}</span>
                )}
                <button type="button" onClick={onClose} aria-label="Close"
                    className="ml-auto size-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                    <XIcon className="size-4" />
                </button>
            </div>

            <form className="flex-1 overflow-y-auto px-5 py-5 space-y-5" onSubmit={handleSubmit}>
                {readOnly && (
                    <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        {canEdit
                            ? "This post is already published, so it can no longer be edited."
                            : "You need the editor role to change posts in this workspace."}
                    </p>
                )}

                {/* Networks */}
                <div>
                    <label className="block text-xs text-slate-500 uppercase mb-2">Networks</label>
                    <div className="flex flex-wrap gap-2.5">
                        {enabledPlatforms.map((p) => {
                            const active = platforms.includes(p.id);
                            return (
                                <button key={p.id} type="button" disabled={readOnly} title={p.name} aria-pressed={active}
                                    onClick={() => togglePlatform(p.id)}
                                    className={`flex items-center justify-center size-11 rounded-lg border transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed ${active ? "bg-red-50 border-red-300 text-red-500" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                                    <p.icon className="size-4.5" />
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Media */}
                <div>
                    <label className="block text-xs text-slate-500 uppercase mb-2">Media</label>
                    {mediaFile || existingMedia ? (
                        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                            {(mediaFile ? mediaFile.type.startsWith("image/") : existingMedia?.type !== "video") ? (
                                <img src={filePreview ?? existingMedia!.url} alt="preview" className="w-full h-40 object-cover" />
                            ) : (
                                <video src={filePreview ?? existingMedia!.url} className="w-full h-40 object-cover" controls />
                            )}
                            {!readOnly && (
                                <button type="button" aria-label="Remove media"
                                    onClick={() => { setMediaFile(null); setExistingMedia(null) }}
                                    className="absolute top-2 right-2 size-7 bg-slate-900/60 hover:bg-slate-900/80 text-white rounded-full flex items-center justify-center transition-colors">
                                    <XIcon className="size-3.5" />
                                </button>
                            )}
                        </div>
                    ) : (
                        <label className={`flex flex-col items-center justify-center gap-1.5 p-5 py-8 border-2 border-dashed border-slate-200 rounded-xl transition-all group ${readOnly ? "opacity-60" : "cursor-pointer hover:border-red-300 hover:bg-red-50/30"}`}>
                            <span className="text-sm text-slate-500 group-hover:text-red-600 transition-colors">Add media</span>
                            <span className="text-xs text-slate-400">Image or video</span>
                            <input type="file" accept="image/*,video/*" className="hidden" disabled={readOnly}
                                onChange={(e) => e.target.files?.[0] && setMediaFile(e.target.files[0])} />
                        </label>
                    )}
                </div>

                {/* Content */}
                <div>
                    <label className="block text-xs text-slate-500 uppercase mb-2">Content</label>
                    <textarea required rows={5} disabled={readOnly} placeholder="Write your content here…"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 outline-none resize-none disabled:opacity-70"
                        value={content} onChange={(e) => setContent(e.target.value)} />
                    <div className={`text-right text-xs mt-1 font-medium ${content.length > 270 ? "text-red-500" : "text-slate-400"}`}>
                        {content.length}/280
                    </div>
                </div>

                {/* When */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-slate-500 uppercase mb-2">Date</label>
                        <div className="relative">
                            <CalendarIcon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input type="date" required disabled={readOnly} value={date} onChange={(e) => setDate(e.target.value)}
                                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm outline-none disabled:opacity-70" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 uppercase mb-2">Time</label>
                        <div className="relative">
                            <ClockIcon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input type="time" required disabled={readOnly} value={time} onChange={(e) => setTime(e.target.value)}
                                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm outline-none disabled:opacity-70" />
                        </div>
                    </div>
                </div>

                {/* Draft / scheduled */}
                {!readOnly && (
                    <label className="flex items-center gap-2.5 text-sm text-slate-600">
                        <input type="checkbox" className="size-4 accent-red-500" checked={status === "draft"}
                            onChange={(e) => setStatus(e.target.checked ? "draft" : "scheduled")} />
                        Save as draft — do not publish automatically
                    </label>
                )}
            </form>

            {/* Actions */}
            <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100">
                {post && canEdit && (
                    <button type="button" onClick={handleDelete} disabled={deleting}
                        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${confirmDelete ? "bg-red-500 text-white hover:bg-red-600" : "text-slate-500 hover:bg-red-50 hover:text-red-600"}`}>
                        {deleting ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
                        {confirmDelete ? "Confirm delete" : "Delete"}
                    </button>
                )}
                {!readOnly && (
                    <button type="button" onClick={handleSubmit} disabled={saving}
                        className="ml-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-70 transition-colors text-white rounded-lg text-sm">
                        {saving && <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                        {post ? "Save changes" : "Schedule post"}
                    </button>
                )}
            </div>
        </aside>
    )
}

export default PostEditorPanel
