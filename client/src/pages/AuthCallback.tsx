import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import api, { TOKEN_KEY } from "../api/axios";
import { PENDING_INVITE_KEY } from "./AcceptInvite";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { navigate("/login?error=oauth_failed"); return; }

    // Clear token from URL immediately
    window.history.replaceState({}, "", "/auth/callback");

    (async () => {
      try {
        // The request interceptor reads the token from storage, so it has to be
        // written before the first call — `login()` has not run yet.
        localStorage.setItem(TOKEN_KEY, token);
        const { data } = await api.get("/api/auth/me");
        login(data, token);

        // Set before the Google redirect by the invite page; it survives the
        // round trip because OAuth returns to the same origin.
        const pendingInvite = localStorage.getItem(PENDING_INVITE_KEY);
        navigate(pendingInvite ? `/invite/${pendingInvite}` : "/dashboard");
      } catch {
        toast.error("Sign-in failed.");
        navigate("/login?error=oauth_failed");
      }
    })();
  }, []);

  return <div className="p-8 text-center">Signing you in…</div>;
}
