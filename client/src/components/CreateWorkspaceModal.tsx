import { useState } from "react";
import { XIcon } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/axios";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];

interface CreateWorkspaceModalProps {
    onClose: () => void;
    onCreated: (workspaceId: string) => void;
}

const CreateWorkspaceModal = ({ onClose, onCreated }: CreateWorkspaceModalProps) => {
    const [name, setName] = useState("")
    const [color, setColor] = useState(COLORS[0])
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { toast.error("Give your workspace a name"); return; }

        setLoading(true);
        try {
            const { data } = await api.post("/api/workspaces", { name: name.trim(), color });
            toast.success(`"${data.name}" created`);
            onCreated(data._id);
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || "Could not create the workspace");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 shadow">
                    <h3 className="text-slate-700">New Workspace</h3>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
                        <XIcon className="size-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5 text-sm">
                    <div>
                        <label className="block mb-1.5 text-slate-700">Name</label>
                        <input
                            type="text" required autoFocus maxLength={60}
                            placeholder="Acme Marketing"
                            value={name} onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 outline-slate-300 border border-slate-200 rounded-full"
                        />
                        <p className="text-xs text-slate-400 mt-1.5">
                            Accounts, posts and activity are kept separate in each workspace.
                        </p>
                    </div>

                    <div>
                        <label className="block mb-2 text-slate-700">Colour</label>
                        <div className="flex flex-wrap gap-2">
                            {COLORS.map((c) => (
                                <button
                                    key={c} type="button" onClick={() => setColor(c)}
                                    aria-label={`Select colour ${c}`}
                                    className={`size-7 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-slate-400 scale-110" : "hover:scale-110"}`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-full text-slate-500 hover:bg-slate-100 transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} className="px-5 py-2.5 bg-linear-to-r from-red-600 to-red-500 text-white rounded-full transition-all disabled:opacity-60 flex items-center gap-2">
                            {loading && <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                            Create
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default CreateWorkspaceModal
