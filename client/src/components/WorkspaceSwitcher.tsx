import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";
import { ROLE_LABELS } from "../lib/roles";
import CreateWorkspaceModal from "./CreateWorkspaceModal";

const Swatch = ({ name, color, className = "size-6" }: { name: string; color?: string; className?: string }) => (
    <div
        className={`${className} rounded-md flex items-center justify-center text-white text-xs shrink-0`}
        style={{ backgroundColor: color || "#ef4444" }}
    >
        {name.charAt(0).toUpperCase()}
    </div>
)

const WorkspaceSwitcher = () => {
    const { workspaces, activeWorkspace, switchWorkspace, refreshWorkspaces } = useWorkspace();
    const [isOpen, setIsOpen] = useState(false)
    const [showCreate, setShowCreate] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    // Close on outside click and on Escape — the popover covers the nav below it.
    useEffect(() => {
        if (!isOpen) return;

        const onPointerDown = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [isOpen])

    const handleCreated = async (workspaceId: string) => {
        setShowCreate(false);
        setIsOpen(false);
        await refreshWorkspaces();
        switchWorkspace(workspaceId);
    }

    if (!activeWorkspace) return null;

    return (
        <>
            <div className="px-3 relative" ref={containerRef}>
                <button
                    onClick={() => setIsOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-left"
                >
                    <Swatch name={activeWorkspace.name} color={activeWorkspace.color} />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-800 truncate">{activeWorkspace.name}</div>
                        <div className="text-xs text-slate-400 truncate">{ROLE_LABELS[activeWorkspace.role]}</div>
                    </div>
                    <ChevronsUpDownIcon className="size-4 text-slate-400 shrink-0" />
                </button>

                {isOpen && (
                    <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                        <div className="px-3 py-2 border-b border-slate-100">
                            <span className="text-xs text-slate-500 uppercase tracking-wider">Workspaces</span>
                        </div>

                        <div className="max-h-64 overflow-y-auto py-1">
                            {workspaces.map((w) => {
                                const isActive = w._id === activeWorkspace._id;
                                return (
                                    <button
                                        key={w._id}
                                        onClick={() => { switchWorkspace(w._id); setIsOpen(false); }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${isActive ? "bg-red-50" : "hover:bg-slate-50"}`}
                                    >
                                        <Swatch name={w.name} color={w.color} />
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm truncate ${isActive ? "text-red-700" : "text-slate-800"}`}>{w.name}</div>
                                            <div className="text-xs text-slate-400 truncate">
                                                {ROLE_LABELS[w.role]}
                                                {w.memberCount && w.memberCount > 1 ? ` · ${w.memberCount} members` : ""}
                                            </div>
                                        </div>
                                        {isActive && <CheckIcon className="size-4 text-red-500 shrink-0" />}
                                    </button>
                                )
                            })}
                        </div>

                        <button
                            onClick={() => { setShowCreate(true); setIsOpen(false); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 border-t border-slate-100 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                            <div className="size-6 rounded-md border border-dashed border-slate-300 flex items-center justify-center shrink-0">
                                <PlusIcon className="size-3.5 text-slate-400" />
                            </div>
                            New workspace
                        </button>
                    </div>
                )}
            </div>

            {showCreate && (
                <CreateWorkspaceModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
            )}
        </>
    )
}

export default WorkspaceSwitcher
