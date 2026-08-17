import { createContext, useCallback, useContext, useEffect, useState } from "react";
import toast from "react-hot-toast";
import api, { ACTIVE_WORKSPACE_KEY, WORKSPACE_INVALID_EVENT } from "../api/axios";
import { useAuth } from "./AuthContext";
import { hasRole, type Role } from "../lib/roles";

export interface Workspace {
    _id: string;
    name: string;
    color?: string;
    isPersonal: boolean;
    role: Role;
    memberCount?: number;
}

interface WorkspaceContextType {
    workspaces: Workspace[];
    activeWorkspace: Workspace | null;
    activeWorkspaceId: string | null;
    role: Role | null;
    isLoading: boolean;
    switchWorkspace: (id: string) => void;
    refreshWorkspaces: () => Promise<Workspace[]>;
    /** Affordance helper only — hides controls. The server enforces access. */
    can: (min: Role) => boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

/**
 * Picks which workspace should be active: the persisted one if it still exists,
 * otherwise the personal one, otherwise the first available.
 */
const chooseActive = (workspaces: Workspace[], preferredId: string | null): string | null => {
    if (workspaces.length === 0) return null;
    if (preferredId && workspaces.some((w) => w._id === preferredId)) return preferredId;
    return (workspaces.find((w) => w.isPersonal) ?? workspaces[0])._id;
}

export const WorkspaceProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
    const { isAuthenticated, isLoading: authLoading } = useAuth();

    const [workspaces, setWorkspaces] = useState<Workspace[]>([])
    const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
        () => localStorage.getItem(ACTIVE_WORKSPACE_KEY)
    )
    const [isLoading, setIsLoading] = useState(true)

    // Kept in localStorage rather than only in state because the axios request
    // interceptor reads it there on every call.
    const persistActive = useCallback((id: string | null) => {
        setActiveWorkspaceId(id);
        if (id) localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
        else localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    }, [])

    const loadWorkspaces = useCallback(async (preferredId?: string | null) => {
        const { data } = await api.get<Workspace[]>("/api/workspaces");
        setWorkspaces(data);

        const preferred = preferredId !== undefined ? preferredId : localStorage.getItem(ACTIVE_WORKSPACE_KEY);
        persistActive(chooseActive(data, preferred));

        return data;
    }, [persistActive])

    // Deliberately gated on authLoading: fetching before the stored token has
    // been read would 401 on every reload.
    useEffect(() => {
        if (authLoading) return;

        if (!isAuthenticated) {
            // Resetting here is what makes logout -> sign in as someone else clean.
            setWorkspaces([]);
            persistActive(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        loadWorkspaces()
            .catch(() => { /* the 401/403 interceptors handle the recoverable cases */ })
            .finally(() => setIsLoading(false));
    }, [authLoading, isAuthenticated, loadWorkspaces, persistActive])

    // Raised by the API client on WORKSPACE_FORBIDDEN / WORKSPACE_NOT_FOUND —
    // i.e. removed from the workspace, or it was deleted in another tab.
    useEffect(() => {
        const handler = () => {
            persistActive(null);
            loadWorkspaces(null)
                .then((list) => {
                    if (list.length > 0) toast.error("That workspace is no longer available.");
                })
                .catch(() => {});
        };
        window.addEventListener(WORKSPACE_INVALID_EVENT, handler);
        return () => window.removeEventListener(WORKSPACE_INVALID_EVENT, handler);
    }, [loadWorkspaces, persistActive])

    const switchWorkspace = useCallback((id: string) => {
        persistActive(id);
    }, [persistActive])

    const activeWorkspace = workspaces.find((w) => w._id === activeWorkspaceId) ?? null;
    const role = activeWorkspace?.role ?? null;

    const can = useCallback((min: Role) => hasRole(role, min), [role])

    return (
        <WorkspaceContext.Provider value={{
            workspaces,
            activeWorkspace,
            activeWorkspaceId,
            role,
            isLoading,
            switchWorkspace,
            refreshWorkspaces: () => loadWorkspaces(),
            can,
        }}>
            {children}
        </WorkspaceContext.Provider>
    )
}

export const useWorkspace = () => {
    const context = useContext(WorkspaceContext);
    if (context === undefined) {
        throw new Error("useWorkspace must be used within a WorkspaceProvider");
    }
    return context;
}
