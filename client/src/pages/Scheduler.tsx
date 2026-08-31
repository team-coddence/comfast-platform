import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/axios";
import { PLATFORMS } from "../assets/assets";
import { useEnabledPlatforms } from "../hooks/useEnabledPlatforms";
import { useWorkspace } from "../context/WorkspaceContext";
import WeekCalendar from "../components/Scheduler/WeekCalendar";
import PostEditorPanel from "../components/Scheduler/PostEditorPanel";
import { STATUS_STYLES, type Post } from "../lib/posts";
import { addDays, formatWeekRange, startOfWeek, weekDays } from "../lib/calendar";

const Scheduler = () => {
  const enabledPlatforms = useEnabledPlatforms();
  const canEdit = useWorkspace().can("editor");

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [posts, setPosts] = useState<Post[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // The panel is open when either is set: a post to edit, or a slot to fill.
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [composingSlot, setComposingSlot] = useState<Date | null>(null);
  const panelOpen = editingPost !== null || composingSlot !== null;

  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const fetchPosts = useCallback(async () => {
    try {
      // Only the visible week, so a workspace with a long history does not ship
      // its whole queue on every poll.
      const { data } = await api.get("/api/posts", {
        params: { from: weekStart.toISOString(), to: addDays(weekStart, 7).toISOString() },
      });
      setPosts(data);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error.message);
    }
  }, [weekStart]);

  useEffect(() => {
    fetchPosts();
    // Polling is paused while the editor is open — refreshing under a
    // half-written post would be worse than a slightly stale grid.
    if (panelOpen) return;
    const interval = setInterval(fetchPosts, 15000);
    return () => clearInterval(interval);
  }, [fetchPosts, panelOpen]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  }

  const closePanel = () => {
    setEditingPost(null);
    setComposingSlot(null);
  }

  const openPost = (post: Post) => {
    setComposingSlot(null);
    setEditingPost(post);
  }

  const openSlot = (slot: Date) => {
    setEditingPost(null);
    setComposingSlot(slot);
  }

  /** Drag-and-drop reschedule: the one field the calendar can change on its own. */
  const movePost = async (post: Post, slot: Date) => {
    const previous = posts;
    // Optimistic, so the card lands where it was dropped instead of snapping
    // back for the length of a round trip.
    setPosts((prev) => prev.map((p) => (p._id === post._id ? { ...p, scheduledFor: slot.toISOString() } : p)));
    try {
      await api.patch(`/api/posts/${post._id}`, { scheduledFor: slot.toISOString() });
      toast.success("Post rescheduled");
      fetchPosts();
    } catch (error: any) {
      setPosts(previous);
      toast.error(error?.response?.data?.message || error.message);
    }
  }

  const statusCounts = useMemo(() => {
    const counts = { draft: 0, scheduled: 0, published: 0, failed: 0 };
    posts.forEach((p) => { counts[p.status] += 1 });
    return counts;
  }, [posts]);

  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach((p) => p.platforms.forEach((id) => { counts[id] = (counts[id] ?? 0) + 1 }));
    return counts;
  }, [posts]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-2xl text-slate-900">Calendar</h2>
          <p className="text-slate-500 text-sm mt-0.5">Plan and manage your posts</p>
        </div>

        <div className="flex items-center bg-white border border-slate-200 rounded-lg">
          <button type="button" aria-label="Previous week" onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="px-2.5 py-2 text-slate-400 hover:text-slate-700 transition-colors">
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="px-3 text-sm text-slate-700 whitespace-nowrap">{formatWeekRange(weekStart)}</span>
          <button type="button" aria-label="Next week" onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="px-2.5 py-2 text-slate-400 hover:text-slate-700 transition-colors">
            <ChevronRightIcon className="size-4" />
          </button>
        </div>

        <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))}
          className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 transition-colors">
          Today
        </button>

        <button type="button" aria-label="Refresh" onClick={handleRefresh}
          className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
          <RefreshCwIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>

        {canEdit && !panelOpen && (
          <button type="button" onClick={() => openSlot(new Date())}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-red-500 hover:bg-red-600 transition-colors text-white rounded-lg text-sm">
            <PlusIcon className="size-4" />
            New Post
          </button>
        )}
      </div>

      {/* ── Status legend ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {(Object.keys(STATUS_STYLES) as (keyof typeof STATUS_STYLES)[]).map((status) => (
          <span key={status} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`size-2 rounded-full ${STATUS_STYLES[status].dot}`} />
            {STATUS_STYLES[status].label}
            <span className="text-slate-400">({statusCounts[status]})</span>
          </span>
        ))}
      </div>

      {/* ── Calendar + editor ── */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0">
          <WeekCalendar
            days={days}
            posts={posts}
            selectedId={editingPost?._id ?? null}
            onSelectPost={openPost}
            onSelectSlot={openSlot}
            onMovePost={canEdit ? movePost : undefined}
            canEdit={canEdit}
          />
        </div>

        {panelOpen && (
          <PostEditorPanel
            post={editingPost}
            slot={composingSlot}
            canEdit={canEdit}
            onClose={closePanel}
            onSaved={fetchPosts}
          />
        )}
      </div>

      {/* ── Week summary ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
          <div className="text-2xl text-slate-900">{posts.length}</div>
          <div className="text-sm text-slate-500 mt-0.5">Posts this week</div>
        </div>
        {enabledPlatforms.map((platform) => (
          <div key={platform.id} className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
            <div className="text-2xl text-slate-900">{platformCounts[platform.id] ?? 0}</div>
            <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-0.5">
              <platform.icon className="size-3.5 text-slate-400" />
              {PLATFORMS.find((p) => p.id === platform.id)?.name ?? platform.id}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Scheduler
