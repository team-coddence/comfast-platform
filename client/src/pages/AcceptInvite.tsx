import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircleIcon, LayersIcon } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "../lib/roles";

/**
 * localStorage rather than passport's `state` parameter: the Google round trip
 * destroys all in-page state and returns to a fixed /auth/callback URL, but it
 * comes back to the same origin — so a key written here survives it. Threading
 * `state` through would need changes on both the client and the server for a
 * benefit (cross-device sign-in) that does not apply.
 */
export const PENDING_INVITE_KEY = "pendingInvite";

interface InvitePreview {
    workspaceName: string;
    workspaceColor?: string;
    inviterName: string;
    role: Role;
    invitedEmail: string;
    expiresAt: string;
}

const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-8 text-center">
            <Link to="/" className="flex items-center justify-center gap-2 mb-6">
                <img src="/logo.svg" alt="Logo" className="size-6.5" />
                <span className="text-2xl">Scheduler</span>
            </Link>
            {children}
        </div>
    </div>
)

const AcceptInvite = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const { refreshWorkspaces, switchWorkspace } = useWorkspace();

    const [preview, setPreview] = useState<InvitePreview | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [accepting, setAccepting] = useState(false)

    const loadPreview = useCallback(async () => {
        try {
            const { data } = await api.get<InvitePreview>(`/api/invitations/${token}`);
            setPreview(data);
        } catch (err: any) {
            setError(err?.response?.data?.message || "This invitation link is no longer valid.");
        } finally {
            setLoading(false);
        }
    }, [token])

    useEffect(() => { loadPreview() }, [loadPreview])

    const handleSignIn = () => {
        // Picked up by Login and AuthCallback so the user lands back here after
        // signing in or signing up — including through Google.
        localStorage.setItem(PENDING_INVITE_KEY, token!);
        navigate(`/login?invite=${token}`);
    }

    const handleAccept = async () => {
        setAccepting(true);
        try {
            const { data } = await api.post(`/api/invitations/${token}/accept`);
            localStorage.removeItem(PENDING_INVITE_KEY);

            await refreshWorkspaces();
            switchWorkspace(data.workspace._id);

            toast.success(data.alreadyMember
                ? `You are already a member of ${data.workspace.name}`
                : `You have joined ${data.workspace.name}`);
            navigate("/dashboard");
        } catch (err: any) {
            const message = err?.response?.data?.message || "Could not accept this invitation.";
            // A mismatch is not a transient failure — clear the pending key so
            // the user is not bounced back here after signing in again.
            if (err?.response?.data?.code === "INVITE_EMAIL_MISMATCH") {
                localStorage.removeItem(PENDING_INVITE_KEY);
                setError(`${message} You are signed in with a different account — sign out and use the invited address.`);
            } else {
                toast.error(message);
            }
        } finally {
            setAccepting(false);
        }
    }

    if (loading || authLoading) {
        return (
            <Shell>
                <div className="flex justify-center py-6">
                    <div className="size-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
                </div>
            </Shell>
        )
    }

    if (error || !preview) {
        return (
            <Shell>
                <div className="size-12 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
                    <AlertCircleIcon className="size-6 text-amber-500" />
                </div>
                <h1 className="text-slate-800 mb-1.5">Invitation unavailable</h1>
                <p className="text-sm text-slate-500 mb-6">{error}</p>
                <Link to="/dashboard" className="inline-block px-5 py-2.5 rounded-full text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                    Go to your dashboard
                </Link>
            </Shell>
        )
    }

    return (
        <Shell>
            <div
                className="size-12 rounded-xl flex items-center justify-center mx-auto mb-4 text-white"
                style={{ backgroundColor: preview.workspaceColor || "#ef4444" }}
            >
                <LayersIcon className="size-6" />
            </div>

            <h1 className="text-slate-800 mb-1.5">Join {preview.workspaceName}</h1>
            <p className="text-sm text-slate-500 mb-6">
                {preview.inviterName} invited <strong>{preview.invitedEmail}</strong> to collaborate
                as a <strong>{ROLE_LABELS[preview.role].toLowerCase()}</strong>.
                <br />
                <span className="text-xs text-slate-400">{ROLE_DESCRIPTIONS[preview.role]}</span>
            </p>

            {isAuthenticated ? (
                <button
                    onClick={handleAccept} disabled={accepting}
                    className="w-full py-2.5 px-4 bg-linear-to-r from-red-600 to-red-500 text-white rounded-full text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                >
                    {accepting && <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    Accept invitation
                </button>
            ) : (
                <>
                    <button
                        onClick={handleSignIn}
                        className="w-full py-2.5 px-4 bg-linear-to-r from-red-600 to-red-500 text-white rounded-full text-sm"
                    >
                        Sign in to join
                    </button>
                    <p className="text-xs text-slate-400 mt-3">
                        No account yet? Create one with {preview.invitedEmail} and you will come straight back here.
                    </p>
                </>
            )}

            <p className="text-xs text-slate-400 mt-5">
                This link expires on {new Date(preview.expiresAt).toLocaleDateString()}.
            </p>
        </Shell>
    )
}

export default AcceptInvite
