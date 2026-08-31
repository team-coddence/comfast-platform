import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { PLATFORMS } from "../../assets/assets";
import { STATUS_STYLES, isEditable, type Post } from "../../lib/posts";
import { END_HOUR, HOURS, START_HOUR, DAY_LABELS, formatTime, isToday, offsetInDay, isSameDay } from "../../lib/calendar";

interface Props {
    /** The seven day-start dates being displayed, Sunday first. */
    days: Date[];
    posts: Post[];
    /** Id of the post currently open in the editor, highlighted in the grid. */
    selectedId: string | null;
    onSelectPost: (post: Post) => void;
    /** Fired when an empty slot is clicked, with that slot's local instant. */
    onSelectSlot: (slot: Date) => void;
    /** Fired when a post is dropped on another slot. Absent for viewers. */
    onMovePost?: (post: Post, slot: Date) => void;
    canEdit: boolean;
}

const ROW_HEIGHT = 56;

/** Post cards are absolutely positioned, so they need an explicit height. */
const CARD_HEIGHT = 46;

const WeekCalendar = ({ days, posts, selectedId, onSelectPost, onSelectSlot, onMovePost, canEdit }: Props) => {
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropSlot, setDropSlot] = useState<string | null>(null);

    const gridHeight = HOURS.length * ROW_HEIGHT;

    const slotAt = (day: Date, hour: number): Date => {
        const slot = new Date(day);
        slot.setHours(hour, 0, 0, 0);
        return slot;
    }

    const handleDrop = (day: Date, hour: number) => {
        const post = posts.find((p) => p._id === dragId);
        setDragId(null);
        setDropSlot(null);
        if (!post || !onMovePost) return;

        const slot = slotAt(day, hour);
        // Keep the minutes the post already had; the grid only has hour rows,
        // so dropping should not silently round 09:30 down to 09:00.
        slot.setMinutes(new Date(post.scheduledFor).getMinutes());
        onMovePost(post, slot);
    }

    return (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-slate-100">
                <div />
                {days.map((day) => (
                    <div key={day.toISOString()} className="py-3 text-center">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">{DAY_LABELS[day.getDay()]}</div>
                        <div className={`mx-auto mt-1 size-8 flex items-center justify-center rounded-full text-lg ${isToday(day) ? "bg-emerald-500 text-white" : "text-slate-700"}`}>
                            {day.getDate()}
                        </div>
                    </div>
                ))}
            </div>

            {/* Time grid */}
            <div className="overflow-y-auto max-h-[560px]">
                <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height: gridHeight }}>
                    {/* Hour gutter */}
                    <div className="relative border-r border-slate-100">
                        {HOURS.map((hour, i) => (
                            <div key={hour} className="absolute right-2 -translate-y-1/2 text-[11px] text-slate-400"
                                style={{ top: i * ROW_HEIGHT }}>
                                {String(hour).padStart(2, "0")}h
                            </div>
                        ))}
                    </div>

                    {/* Day columns */}
                    {days.map((day) => {
                        const dayPosts = posts
                            .filter((p) => isSameDay(new Date(p.scheduledFor), day))
                            .sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor));

                        return (
                            <div key={day.toISOString()} className={`relative border-r border-slate-100 last:border-r-0 ${isToday(day) ? "bg-emerald-50/30" : ""}`}>
                                {/* Clickable hour cells, behind the post cards */}
                                {HOURS.map((hour, i) => {
                                    const key = `${day.toDateString()}-${hour}`;
                                    return (
                                        <button key={hour} type="button" disabled={!canEdit}
                                            aria-label={`New post on ${day.toDateString()} at ${String(hour).padStart(2, "0")}:00`}
                                            onClick={() => canEdit && onSelectSlot(slotAt(day, hour))}
                                            onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropSlot(key) } }}
                                            onDragLeave={() => setDropSlot((prev) => (prev === key ? null : prev))}
                                            onDrop={(e) => { e.preventDefault(); handleDrop(day, hour) }}
                                            className={`absolute left-0 right-0 border-b border-slate-50 group transition-colors ${dropSlot === key ? "bg-emerald-50" : "hover:bg-slate-50/70"} ${canEdit ? "cursor-pointer" : "cursor-default"}`}
                                            style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}>
                                            {canEdit && (
                                                <PlusIcon className="size-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity mx-auto" />
                                            )}
                                        </button>
                                    )
                                })}

                                {/* Posts */}
                                {dayPosts.map((post) => {
                                    const when = new Date(post.scheduledFor);
                                    const style = STATUS_STYLES[post.status];
                                    const draggable = canEdit && isEditable(post) && Boolean(onMovePost);
                                    // Clamp so a post near END_HOUR does not hang off the bottom.
                                    const top = Math.min(offsetInDay(when) * gridHeight, gridHeight - CARD_HEIGHT);

                                    return (
                                        <button key={post._id} type="button" draggable={draggable}
                                            onDragStart={() => setDragId(post._id)}
                                            onDragEnd={() => { setDragId(null); setDropSlot(null) }}
                                            onClick={() => onSelectPost(post)}
                                            title={post.content}
                                            className={`absolute left-1 right-1 px-2 py-1 rounded-lg border text-left overflow-hidden transition-all ${style.card} ${selectedId === post._id ? "ring-2 ring-red-400" : ""} ${dragId === post._id ? "opacity-40" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                                            style={{ top, height: CARD_HEIGHT }}>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`size-1.5 rounded-full shrink-0 ${style.dot}`} />
                                                <span className="text-[11px] text-slate-500 shrink-0">{formatTime(when)}</span>
                                                <span className="flex items-center gap-1 ml-auto">
                                                    {post.platforms.slice(0, 3).map((id) => {
                                                        const meta = PLATFORMS.find((p) => p.id === id);
                                                        return meta ? <meta.icon key={id} className="size-3 text-slate-400" /> : null;
                                                    })}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-700 truncate mt-0.5">{post.content || "Untitled"}</p>
                                        </button>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            </div>

            <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
                Showing {String(START_HOUR).padStart(2, "0")}:00–{String(END_HOUR).padStart(2, "0")}:59.
                {canEdit ? " Click a slot to compose, a post to edit, or drag a post to reschedule it." : " Click a post to view it."}
            </p>
        </div>
    )
}

export default WeekCalendar
