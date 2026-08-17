import { useCallback, useEffect, useState } from "react";
import {
    CopyIcon, LogOutIcon, MailIcon, RotateCwIcon, ShieldIcon, Trash2Icon, UserPlusIcon, UsersRoundIcon, XIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "../lib/roles";

interface Member {
    _id: string;
    role: Role;
    joinedAt: string;
    // Null when the underlying account was deleted.
    user: { _id: string; name: string; email: string; avatarUrl?: string } | null;
}

interface Invitation {
    _id: string;
    email: string;
    role: Role;
    status: "pending" | "accepted" | "revoked" | "expired";
    expiresAt: string;
    isExpired: boolean;
    invitedBy?: { name: string };
    createdAt: string;
}

const Card = ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
    <section className="bg-white rounded-2xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-slate-800">{title}</h2>
            {description && <p className="text-sm text-slate-400 mt-0.5">{description}</p>}
        </div>
        {children}
    </section>
)

const Avatar = ({ name, url }: { name: string; url?: string }) =>
    url
        ? <img src={url} alt="" className="size-9 rounded-full object-cover shrink-0" />
        : (
            <div className="size-9 rounded-full bg-linear-to-br from-red-400 to-pink-400 flex items-center justify-center text-white text-sm shrink-0">
                {name.charAt(0).toUpperCase()}
            </div>
        )

const WorkspaceSettings = () => {
    const { user } = useAuth();
    const { activeWorkspace, refreshWorkspaces, switchWorkspace, workspaces, can } = useWorkspace();

    const [members, setMembers] = useState<Member[]>([])
    const [invitations, setInvitations] = useState<Invitation[]>([])
    const [loading, setLoading] = useState(true)

    const [name, setName] = useState(activeWorkspace?.name ?? "")
    const [savingName, setSavingName] = useState(false)

    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteRole, setInviteRole] = useState<Role>("editor")
    const [inviting, setInviting] = useState(false)
    // The raw token is returned exactly once, so it is held here until dismissed.
    const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)

    const [showDelete, setShowDelete] = useState(false)
    const [confirmName, setConfirmName] = useState("")
    const [deleting, setDeleting] = useState(false)

    const workspaceId = activeWorkspace?._id;
    const isAdmin = can("admin");
    const isOwner = can("owner");

    const load = useCallback(async () => {
        if (!workspaceId) return;
        setLoading(true);
        try {
            const requests: Promise<any>[] = [api.get(`/api/workspaces/${workspaceId}/members`)];
            // Only admins may list invitations; asking as a viewer would 403.
            if (isAdmin) requests.push(api.get(`/api/workspaces/${workspaceId}/invitations`));

            const [membersRes, invitesRes] = await Promise.all(requests);
            setMembers(membersRes.data);
            setInvitations(invitesRes?.data ?? []);
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || "Could not load workspace members");
        } finally {
            setLoading(false);
        }
    }, [workspaceId, isAdmin])

    useEffect(() => { load() }, [load])
    useEffect(() => { setName(activeWorkspace?.name ?? "") }, [activeWorkspace?.name])

    const handleRename = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || name.trim() === activeWorkspace?.name) return;

        setSavingName(true);
        try {
            await api.patch(`/api/workspaces/${workspaceId}`, { name: name.trim() });
            await refreshWorkspaces();
            toast.success("Workspace renamed");
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || "Could not rename the workspace");
        } finally {
            setSavingName(false);
        }
    }

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail.trim()) { toast.error("Enter an email address"); return; }

        setInviting(true);
        try {
            const { data } = await api.post(`/api/workspaces/${workspaceId}/invitations`, {
                email: inviteEmail.trim(), role: inviteRole,
            });
            setLastInviteUrl(data.inviteUrl);
            setInviteEmail("");
            await load();
            toast.success("Invitation created — copy the link and send it");
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || "Could not create the invitation");
        } finally {
            setInviting(false);
        }
    }

    const copyLink = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success("Invite link copied");
        } catch {
            // Clipboard access needs a secure context; show the link instead.
            toast.error("Could not copy — select the link and copy it manually");
        }
    }

    const handleResend = async (inviteId: string) => {
        try {
            const { data } = await api.post(`/api/workspaces/${workspaceId}/invitations/${inviteId}/resend`);
            setLastInviteUrl(data.inviteUrl);
            await load();
            toast.success("New link issued — the previous one no longer works");
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || "Could not reissue the link");
        }
    }

    const handleRevoke = async (inviteId: string, email: string) => {
        if (!window.confirm(`Revoke the invitation for ${email}?`)) return;
        try {
            await api.delete(`/api/workspaces/${workspaceId}/invitations/${inviteId}`);
            await load();
            toast.success("Invitation revoked");
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || "Could not revoke the invitation");
        }
    }

    const handleRoleChange = async (userId: string, role: Role) => {
        try {
            await api.patch(`/api/workspaces/${workspaceId}/members/${userId}`, { role });
            await load();
            toast.success("Role updated");
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || "Could not update the role");
        }
    }

    const handleRemove = async (member: Member) => {
        const label = member.user?.name || "this member";
        if (!window.confirm(
            `Remove ${label} from this workspace?\n\nTheir posts and connected accounts stay here, and their scheduled posts keep publishing.`
        )) return;

        try {
            await api.delete(`/api/workspaces/${workspaceId}/members/${member.user?._id}`);
            await load();
            toast.success("Member removed");
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || "Could not remove the member");
        }
    }

    const handleTransfer = async (member: Member) => {
        if (!window.confirm(
            `Make ${member.user?.name} the owner of this workspace?\n\nYou will be demoted to admin. This cannot be undone by you.`
        )) return;

        try {
            await api.post(`/api/workspaces/${workspaceId}/transfer-ownership`, { userId: member.user?._id });
            await Promise.all([refreshWorkspaces(), load()]);
            toast.success("Ownership transferred");
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || "Could not transfer ownership");
        }
    }

    const handleLeave = async () => {
        if (!window.confirm(`Leave "${activeWorkspace?.name}"? You will need a new invitation to rejoin.`)) return;
        try {
            await api.post(`/api/workspaces/${workspaceId}/leave`);
            const remaining = await refreshWorkspaces();
            if (remaining.length > 0) switchWorkspace(remaining[0]._id);
            toast.success("You have left the workspace");
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || "Could not leave the workspace");
        }
    }

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/api/workspaces/${workspaceId}`, { data: { confirmName } });
            const remaining = await refreshWorkspaces();
            if (remaining.length > 0) switchWorkspace(remaining[0]._id);
            setShowDelete(false);
            toast.success("Workspace deleted");
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || "Could not delete the workspace");
        } finally {
            setDeleting(false);
        }
    }

    if (!activeWorkspace) return null;

    const pendingInvites = invitations.filter((i) => i.status === "pending");
    const isOnlyWorkspace = workspaces.length <= 1;

    return (
        <div className="max-w-3xl space-y-6">

            {/* --- General --- */}
            <Card title="General" description={isAdmin ? "Rename this workspace" : "You have read-only access to these settings"}>
                <form onSubmit={handleRename} className="p-6 flex flex-col sm:flex-row gap-3 text-sm">
                    <input
                        type="text" maxLength={60} disabled={!isAdmin}
                        value={name} onChange={(e) => setName(e.target.value)}
                        className="flex-1 px-4 py-2.5 bg-slate-50 outline-slate-300 border border-slate-200 rounded-full disabled:opacity-60"
                    />
                    {isAdmin && (
                        <button
                            type="submit" disabled={savingName || !name.trim() || name.trim() === activeWorkspace.name}
                            className="px-5 py-2.5 bg-slate-900 text-white rounded-full disabled:opacity-40 transition-all"
                        >
                            {savingName ? "Saving…" : "Save"}
                        </button>
                    )}
                </form>
            </Card>

            {/* --- Invite --- */}
            {isAdmin && (
                <Card title="Invite people" description="Creates a single-use link that expires in 7 days">
                    <form onSubmit={handleInvite} className="p-6 flex flex-col gap-3 text-sm">
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                                <MailIcon className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="email" placeholder="teammate@company.com"
                                    value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 outline-slate-300 border border-slate-200 rounded-full"
                                />
                            </div>
                            <select
                                value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}
                                className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full outline-slate-300"
                            >
                                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                            <button
                                type="submit" disabled={inviting}
                                className="px-5 py-2.5 bg-linear-to-r from-red-600 to-red-500 text-white rounded-full disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {inviting
                                    ? <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    : <UserPlusIcon className="size-4" />}
                                Invite
                            </button>
                        </div>
                        <p className="text-xs text-slate-400">{ROLE_DESCRIPTIONS[inviteRole]}</p>

                        {/* Shown once — the token is not recoverable afterwards. */}
                        {lastInviteUrl && (
                            <div className="mt-1 p-4 rounded-xl bg-slate-50 border border-slate-200">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <p className="text-xs text-slate-500">
                                        Send this link to your teammate. It is shown only once — reissue it if you lose it.
                                    </p>
                                    <button onClick={() => setLastInviteUrl(null)} className="text-slate-400 hover:text-slate-600 shrink-0">
                                        <XIcon className="size-4" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 min-w-0 truncate text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-600">
                                        {lastInviteUrl}
                                    </code>
                                    <button
                                        type="button" onClick={() => copyLink(lastInviteUrl)}
                                        className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 shrink-0"
                                    >
                                        <CopyIcon className="size-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </form>
                </Card>
            )}

            {/* --- Members --- */}
            <Card title="Members" description={`${members.length} ${members.length === 1 ? "person has" : "people have"} access`}>
                {loading ? (
                    <div className="p-10 flex justify-center">
                        <div className="size-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {members.map((member) => {
                            const isSelf = member.user?._id === user?._id;
                            const isMemberOwner = member.role === "owner";
                            // An admin outranks editors and viewers but never the owner.
                            const canManage = isAdmin && !isMemberOwner && !isSelf && !!member.user;

                            return (
                                <div key={member._id} className="px-6 py-4 flex items-center gap-3">
                                    <Avatar name={member.user?.name ?? "?"} url={member.user?.avatarUrl} />

                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-slate-800 truncate flex items-center gap-2">
                                            {member.user?.name ?? <span className="text-slate-400 italic">Removed user</span>}
                                            {isSelf && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">You</span>}
                                        </div>
                                        <div className="text-xs text-slate-400 truncate">{member.user?.email ?? "—"}</div>
                                    </div>

                                    {canManage ? (
                                        <select
                                            value={member.role}
                                            onChange={(e) => handleRoleChange(member.user!._id, e.target.value as Role)}
                                            className="text-sm px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-slate-300"
                                        >
                                            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                        </select>
                                    ) : (
                                        <span className={`text-xs px-2 py-1 rounded ${isMemberOwner ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                                            {ROLE_LABELS[member.role]}
                                        </span>
                                    )}

                                    {isOwner && !isMemberOwner && member.user && (
                                        <button
                                            onClick={() => handleTransfer(member)}
                                            title="Transfer ownership"
                                            className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                                        >
                                            <ShieldIcon className="size-4" />
                                        </button>
                                    )}

                                    {canManage && (
                                        <button
                                            onClick={() => handleRemove(member)}
                                            title="Remove from workspace"
                                            className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2Icon className="size-4" />
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </Card>

            {/* --- Pending invitations --- */}
            {isAdmin && (
                <Card title="Pending invitations" description="Links that have been created but not yet accepted">
                    {pendingInvites.length === 0 ? (
                        <div className="px-6 py-10 text-center">
                            <div className="size-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                                <UsersRoundIcon className="size-6 text-slate-400" />
                            </div>
                            <p className="text-sm text-slate-500">No pending invitations</p>
                            <p className="text-xs text-slate-400 mt-0.5">Invite someone above to get started</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {pendingInvites.map((invite) => (
                                <div key={invite._id} className="px-6 py-4 flex items-center gap-3">
                                    <div className="size-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                        <MailIcon className="size-4 text-slate-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-slate-800 truncate">{invite.email}</div>
                                        <div className="text-xs text-slate-400">
                                            {ROLE_LABELS[invite.role]} ·{" "}
                                            {invite.isExpired
                                                ? <span className="text-amber-600">Expired</span>
                                                : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleResend(invite._id)}
                                        title="Issue a new link"
                                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                                    >
                                        <RotateCwIcon className="size-4" />
                                    </button>
                                    <button
                                        onClick={() => handleRevoke(invite._id, invite.email)}
                                        title="Revoke"
                                        className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2Icon className="size-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {/* --- Danger zone --- */}
            <section className="bg-white rounded-2xl border border-red-200">
                <div className="px-6 py-4 border-b border-red-100">
                    <h2 className="text-red-700">Danger zone</h2>
                </div>
                <div className="divide-y divide-slate-50">
                    <div className="px-6 py-4 flex items-center gap-4">
                        <div className="flex-1">
                            <div className="text-sm text-slate-800">Leave this workspace</div>
                            <div className="text-xs text-slate-400">
                                {isOwner
                                    ? "Transfer ownership to someone else first."
                                    : "You will need a new invitation to rejoin."}
                            </div>
                        </div>
                        <button
                            onClick={handleLeave}
                            className="px-4 py-2 rounded-full text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 flex items-center gap-2 shrink-0 transition-colors"
                        >
                            <LogOutIcon className="size-4" />
                            Leave
                        </button>
                    </div>

                    {isOwner && (
                        <div className="px-6 py-4 flex items-center gap-4">
                            <div className="flex-1">
                                <div className="text-sm text-slate-800">Delete this workspace</div>
                                <div className="text-xs text-slate-400">
                                    {isOnlyWorkspace
                                        ? "This is your only workspace — create another one first."
                                        : "Permanently deletes every connected account, post, generation and activity entry."}
                                </div>
                            </div>
                            <button
                                onClick={() => { setConfirmName(""); setShowDelete(true); }}
                                disabled={isOnlyWorkspace}
                                className="px-4 py-2 rounded-full text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 flex items-center gap-2 shrink-0 transition-colors"
                            >
                                <Trash2Icon className="size-4" />
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            </section>

            {/* Deletion is irreversible and cascades, so it takes a typed name
                rather than the window.confirm used elsewhere. */}
            {showDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100">
                        <div className="flex items-center justify-between px-6 py-4 shadow">
                            <h3 className="text-red-700">Delete workspace</h3>
                            <button onClick={() => setShowDelete(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
                                <XIcon className="size-4" />
                            </button>
                        </div>
                        <div className="p-6 text-sm space-y-4">
                            <p className="text-slate-600">
                                This permanently deletes every connected account, post, AI generation and activity
                                entry in <strong>{activeWorkspace.name}</strong>, and disconnects its social accounts
                                from the publishing service. This cannot be undone.
                            </p>
                            <div>
                                <label className="block mb-1.5 text-slate-700">
                                    Type <strong>{activeWorkspace.name}</strong> to confirm
                                </label>
                                <input
                                    type="text" autoFocus value={confirmName} onChange={(e) => setConfirmName(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-slate-50 outline-slate-300 border border-slate-200 rounded-full"
                                />
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-1">
                                <button onClick={() => setShowDelete(false)} className="px-4 py-2.5 rounded-full text-slate-500 hover:bg-slate-100">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting || confirmName !== activeWorkspace.name}
                                    className="px-5 py-2.5 bg-red-600 text-white rounded-full disabled:opacity-40 flex items-center gap-2"
                                >
                                    {deleting && <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                    Delete forever
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default WorkspaceSettings
