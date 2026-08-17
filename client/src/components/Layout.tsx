import { useState } from 'react'
import Sidebar from './Sidebar'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { MenuIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import NoWorkspace from './NoWorkspace'

const pageTitles: Record<string, string> = {
    "/dashboard" : "Dashboard",
    "/accounts": "Social Accounts",
    "/schedule": "Post Scheduler",
    "/ai-composer": "AI Composer",
    "/settings/workspace": "Workspace Settings",
}

const Layout = () => {

    const {isAuthenticated, isLoading: authLoading} = useAuth()
    const {activeWorkspace, activeWorkspaceId, isLoading: workspaceLoading} = useWorkspace()

    const location = useLocation()

    const title = pageTitles[location.pathname] || "SocialAI";

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

    // Covers the workspace bootstrap too, so no page ever mounts and fires
    // requests before the active workspace header is known.
    if(authLoading || workspaceLoading){
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className='size-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin'/>
            </div>
        )
    }

    if(!isAuthenticated){
        return <Navigate to="/login" replace/>
    }

    // The server self-heals users with no workspace, so this is near
    // unreachable — which is exactly why it needs an explicit branch instead of
    // crashing on a null workspace deeper in the tree.
    if(!activeWorkspace){
        return <NoWorkspace />
    }

  return (
    <div className='flex h-screen bg-slate-50'>

        {/* Mobile Overlay */}
    {isMobileMenuOpen && <div className='fixed inset-0 bg-slate-900/50 z-40 md:hidden' onClick={()=> setIsMobileMenuOpen(false)}/>}

        <Sidebar isOpen={isMobileMenuOpen} setIsOpen={setIsMobileMenuOpen}/>

    <div className='flex-1 flex flex-col overflow-hidden'>
        {/* Top Bar */}
        <header className='h-16 bg-white border-b border-slate-200 flex items-center px-4 md:px-8 gap-4'>

            <button className="md:hidden p-2 -ml-2 text-slate-500" onClick={()=>setIsMobileMenuOpen(true)}>
                <MenuIcon className="size-6"/>
            </button>
            <div>
                <h1 className="text-slate-900">{title}</h1>
                <p className="text-sm text-slate-400 hidden sm:block">Manage and automate your social presence</p>
            </div>

            {/* Which tenant you are looking at, always visible. */}
            <div className='ml-auto hidden sm:flex items-center gap-2 text-sm'>
                <span className='size-2.5 rounded-full shrink-0' style={{backgroundColor: activeWorkspace.color || "#ef4444"}}/>
                <span className='text-slate-600 truncate max-w-[12rem]'>{activeWorkspace.name}</span>
            </div>

        </header>
        {/*
          Keyed on the workspace so a switch unmounts the whole page subtree.
          Every page fetches in a mount-only effect and there is no cache layer,
          so this both re-runs the fetches and discards stale local state —
          which adding the id to each dep array would not.
        */}
        <main key={activeWorkspaceId} className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 xl:p-12">
            <Outlet />
        </main>

    </div>

    </div>
  )
}

export default Layout
