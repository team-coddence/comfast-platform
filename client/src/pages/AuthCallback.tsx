import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { navigate("/login?error=oauth_failed"); return; }

    // Clear token from URL immediately
    window.history.replaceState({}, "", "/auth/callback");

    (async () => {
      try {
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        const { data } = await api.get("/api/auth/me");
        login(data, token);
        navigate("/dashboard");
      } catch {
        toast.error("Sign-in failed.");
        navigate("/login?error=oauth_failed");
      }
    })();
  }, []);

  return <div className="p-8 text-center">Signing you in…</div>;
}
