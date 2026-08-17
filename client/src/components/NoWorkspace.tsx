import { useState } from "react";
import { LayersIcon, LogOutIcon, PlusIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import CreateWorkspaceModal from "./CreateWorkspaceModal";

/**
 * The zero-workspace state. Reachable only if a user's last workspace was
 * deleted while they were signed in — the server creates a default workspace at
 * signup and repairs any account that somehow lacks one.
 */
const NoWorkspace = () => {
    const { logout } = useAuth();
    const { refreshWorkspaces, switchWorkspace } = useWorkspace();
    const [showCreate, setShowCreate] = useState(false)

    const handleCreated = async (workspaceId: string) => {
        setShowCreate(false);
        await refreshWorkspaces();
        switchWorkspace(workspaceId);
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-10 max-w-md w-full text-center">
                <div className="size-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <LayersIcon className="size-6 text-slate-400" />
                </div>
                <h2 className="text-slate-800 mb-1.5">No workspace yet</h2>
                <p className="text-sm text-slate-500 mb-6">
                    Workspaces keep your connected accounts, posts and activity separate.
                    Create one to get started.
                </p>

                <button
                    onClick={() => setShowCreate(true)}
                    className="w-full py-2.5 px-4 bg-linear-to-r from-red-600 to-red-500 text-white rounded-full text-sm flex items-center justify-center gap-2"
                >
                    <PlusIcon className="size-4" />
                    Create a workspace
                </button>

                <button
                    onClick={logout}
                    className="mt-2 w-full py-2.5 px-4 rounded-full text-sm text-slate-500 hover:bg-slate-50 flex items-center justify-center gap-2 transition-colors"
                >
                    <LogOutIcon className="size-4" />
                    Sign out
                </button>
            </div>

            {showCreate && (
                <CreateWorkspaceModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
            )}
        </div>
    )
}

export default NoWorkspace
