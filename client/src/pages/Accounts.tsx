import { useEffect, useState } from "react"
import { PLATFORMS } from "../assets/assets"
import { PlusIcon } from "lucide-react"
import AccountList from "../components/AccountList"
import PlatformPickerModal from "../components/PlatformPickerModal"
import toast from "react-hot-toast"
import api from "../api/axios"


const Accounts = () => {

  const [accounts, setAccounts] = useState<any[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)
  const [showPlatformPicker, setShowPlatformPicker] = useState(false)

  const fetchAccounts = async (isSync = false, platform?: string | null, successMsg?: string) => {
    try {
      if(isSync){
        const label = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : "réseau social";
        toast.loading(`Synchronisation du compte ${label}...`, {id: "sync"});
        await api.get("/api/oauth/sync");
        toast.success(successMsg || "Comptes synchronisés !", { id: "sync" })
      }

      const {data} = await api.get("/api/accounts")
      setAccounts(data)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Impossible de charger les comptes");
    }
  }

  useEffect(()=>{

    const params = new URLSearchParams(window.location.search);
    const connectedPlatform = params.get("connected");
    const connectedUsername = params.get("username");
    const syncNeeded = params.get("sync") === "true";
    const errorMsg = params.get("error");

    window.history.replaceState({}, document.title, window.location.pathname)

    if(connectedPlatform){
      const label = connectedPlatform.charAt(0).toUpperCase() + connectedPlatform.slice(1);
      const handle = connectedUsername ? ` (@${connectedUsername})` : ""
      fetchAccounts(true, connectedPlatform, `${label}${handle} connecté !`)
    } else if(errorMsg){
      toast.error(`Échec de la connexion : ${decodeURIComponent(errorMsg)}`)
      fetchAccounts();
    } else if(syncNeeded){
      fetchAccounts(true, null, "Comptes synchronisés !")
    } else{
       fetchAccounts()
    }
   
  },[])

  const handleConnect = async (platformId: string) => {
    setConnecting(platformId);
    try {
      const { data } = await api.get(`/api/oauth/${platformId}/url`);
      window.location.href = data.url;
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || `Impossible de connecter ${platformId}`)
      setConnecting(null)
    }
  }

  const handleDisconnect = async (accountId: string) => {
    try {
      await api.delete(`/api/accounts/${accountId}`)
      toast.success("Compte déconnecté")
      await fetchAccounts()
    } catch (error : any) {
      toast.error(error?.response?.data?.message || error?.message || "Impossible de déconnecter le compte")
    }
  }

  const connectedIds = accounts.map((a)=>a.platform)

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm">
        <div>
          <h2 className="text-xl text-slate-900">Comptes connectés</h2>
          <p className="text-slate-500 text-sm mt-0.5">{accounts.length} sur {PLATFORMS.length} plateformes connectées</p>
        </div>
        <button onClick={()=> setShowPlatformPicker(true)} className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-full font-medium transition-all w-full sm:w-auto justify-center cursor-pointer">
          <PlusIcon className="size-4" /> Connecter un compte
        </button>
      </div>

      {/* Platform picker modal */}
      {showPlatformPicker && <PlatformPickerModal connectedIds={connectedIds} connecting={connecting} onClose={()=> setShowPlatformPicker(false)} onConnect={handleConnect}/>}

      {/* Connected accounts list */}
      <AccountList accounts={accounts} onDisconnect={handleDisconnect}/>

    </div>
  )
}

export default Accounts