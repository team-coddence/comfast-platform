import { useEffect, useState } from "react"
import { PlusIcon, RefreshCwIcon } from "lucide-react"
import AccountList from "../components/AccountList"
import PlatformPickerModal from "../components/PlatformPickerModal"
import toast from "react-hot-toast"
import api from "../api/axios"
import { useEnabledPlatforms } from "../hooks/useEnabledPlatforms"
import { useWorkspace } from "../context/WorkspaceContext"

// sessionStorage is per-tab, which is exactly the scoping needed: it records
// which workspace a connect flow started in, so switching workspaces in another
// tab mid-OAuth cannot land the new account in the wrong one.
const CONNECTING_WORKSPACE_KEY = "connectingWorkspaceId";

const Accounts = () => {

  const enabledPlatforms = useEnabledPlatforms()
  const { activeWorkspaceId, switchWorkspace, can } = useWorkspace()
  const canManage = can("admin")
  const [accounts, setAccounts] = useState<any[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)
  const [showPlatformPicker, setShowPlatformPicker] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const fetchAccounts = async (isSync = false, platform?: string | null, successMsg?: string) => {
    try {
      if(isSync){
        const label = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : "Social Media";
        toast.loading(`Syncing ${label} account...`, {id: "sync"});
        await api.get("/api/oauth/sync");
        toast.success(successMsg || "Accounts synced!", { id: "sync" })
      }

      const {data} = await api.get("/api/accounts")
      setAccounts(data)
    } catch (error: any) {
      if (error?.response?.data?.code === "PAYMENT_REQUIRED") {
        toast.error(error.response.data.message, { duration: 8000 });
      } else {
        toast.error(error?.response?.data?.message || error?.message || "Failed to load accounts");
      }
    }
  }

  useEffect(()=>{

    const params = new URLSearchParams(window.location.search);
    const connectedPlatform = params.get("connected");
    const connectedUsername = params.get("username");
    const syncNeeded = params.get("sync") === "true";
    const errorMsg = params.get("error");

    window.history.replaceState({}, document.title, window.location.pathname)

    // Returning from a connect flow that began in a different workspace: the
    // account belongs there, so switch back before syncing. The remount that
    // follows re-runs this effect against the correct workspace.
    const connectingWorkspaceId = sessionStorage.getItem(CONNECTING_WORKSPACE_KEY);
    if(connectingWorkspaceId){
      sessionStorage.removeItem(CONNECTING_WORKSPACE_KEY);
      if(connectingWorkspaceId !== activeWorkspaceId){
        toast("Switched back to the workspace you started connecting from");
        switchWorkspace(connectingWorkspaceId);
        return;
      }
    }

    if(connectedPlatform){
      const label = connectedPlatform.charAt(0).toUpperCase() + connectedPlatform.slice(1);
      const handle = connectedUsername ? ` (@${connectedUsername})` : ""
      fetchAccounts(true, connectedPlatform, `${label}${handle} connected!`)
    } else if(errorMsg){
      toast.error(`Connection failed: ${decodeURIComponent(errorMsg)}`)
      fetchAccounts();
    } else if(syncNeeded){
      fetchAccounts(true, null, "Accounts synced!")
    } else{
       fetchAccounts()
    }
   
  },[])

  const handleConnect = async (platformId: string) => {
    setConnecting(platformId);
    try {
      const { data } = await api.get(`/api/oauth/${platformId}/url`);
      if(activeWorkspaceId) sessionStorage.setItem(CONNECTING_WORKSPACE_KEY, activeWorkspaceId);
      window.location.href = data.url;
    } catch (error: any) {
      if (error?.response?.data?.code === "PAYMENT_REQUIRED") {
        toast.error(error.response.data.message, { duration: 8000 });
      } else {
        toast.error(error?.response?.data?.message || error?.message || `Failed to connect ${platformId}`)
      }
      setConnecting(null)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetchAccounts(true, null, "Accounts synced!")
    } finally {
      setSyncing(false)
    }
  }

  const handleDisconnect = async (accountId: string) => {
    try {
      await api.delete(`/api/accounts/${accountId}`)
      toast.success("Account disconnected")
      await fetchAccounts()
    } catch (error : any) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to disconnect account")
    }
  }

  const connectedIds = accounts.map((a)=>a.platform)

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm">
        <div>
          <h2 className="text-xl text-slate-900">Connected Accounts</h2>
          <p className="text-slate-500 text-sm mt-0.5">{accounts.length} of {enabledPlatforms.length} platforms connected</p>
        </div>
        {/* Connecting moves OAuth tokens and can incur billing, so the server
            restricts it to admins. Hide the controls to match. */}
        {canManage && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button onClick={handleSync} disabled={syncing} title="Pull in accounts connected via the Zernio dashboard" className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 rounded-full font-medium transition-all disabled:opacity-60">
              <RefreshCwIcon className={`size-4 ${syncing ? "animate-spin" : ""}`} /> Sync
            </button>
            <button onClick={()=> setShowPlatformPicker(true)} className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-full font-medium transition-all flex-1 sm:flex-none justify-center">
              <PlusIcon className="size-4" /> Connect Account
            </button>
          </div>
        )}
      </div>

      {/* Platform picker modal */}
      {showPlatformPicker && <PlatformPickerModal platforms={enabledPlatforms} connectedIds={connectedIds} connecting={connecting} onClose={()=> setShowPlatformPicker(false)} onConnect={handleConnect}/>}

      {/* Connected accounts list */}
      <AccountList accounts={accounts} onDisconnect={canManage ? handleDisconnect : undefined}/>

    </div>
  )
}

export default Accounts