import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Scheduler from "./pages/Scheduler";
import AIComposer from "./pages/AIComposer";
import { Toaster } from "react-hot-toast";
import AuthCallback from "./pages/AuthCallback";
import AcceptInvite from "./pages/AcceptInvite";
import WorkspaceSettings from "./pages/WorkspaceSettings";

export default function App() {
    return (
        <>
            <Toaster position="top-right"/>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/login" element={<Login />} />
                {/* Outside Layout — it must render for someone who is not
                    signed in yet, and before they belong to any workspace. */}
                <Route path="/invite/:token" element={<AcceptInvite />} />
                <Route element={<Layout />}>
                    <Route path="/dashboard" element={<Dashboard />}/>
                    <Route path="/accounts" element={<Accounts />}/>
                    <Route path="/schedule" element={<Scheduler />}/>
                    <Route path="/ai-composer" element={<AIComposer />}/>
                    <Route path="/settings/workspace" element={<WorkspaceSettings />}/>

                </Route>
            </Routes>
        </>
    );
}
