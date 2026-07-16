import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MailIcon, LockIcon, ArrowRightIcon, User2Icon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import toast from "react-hot-toast";

function GoogleIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.707C4.672 4.581 6.656 3.58 9 3.58z" />
        </svg>
    );
}

export default function Login() {
    const [loginState, setLoginState] = useState(true);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const {login, user} = useAuth()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
       try {
            const { data } = await api.post(`/api/auth/${loginState ? "login" : "register"}`, { name, email, password })

            login(data, data.token)
            navigate("/dashboard")
       } catch (error: any) {
            toast.error(error.response?.data?.message || error?.message)
       }finally{
        setLoading(false)
       }
    };

    const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

    const goto = (provider: "google") => {
        window.location.href = `${apiBase}/api/auth/oauth/${provider}`;
    };

    useEffect(() => {
    const err = new URLSearchParams(location.search).get("error");
    if (err === "oauth_failed") toast.error("Sign-in cancelled or failed.");
    }, []);

    useEffect(()=>{
        if(user) navigate('/dashboard')
    },[user])

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="relative w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-sm p-8">
                    <div className="flex flex-col items-center mb-8">
                        <Link to="/" className="flex items-center">
                            <img src="/logo.svg" alt="Logo" className="w-full h-6 mb-3" />
                        </Link>
                        <p className="text-slate-500 text-sm mt-1">Connectez-vous à votre tableau de bord</p>
                    </div>
                    <div className="flex flex-col gap-2 mb-4">
                        <button
                            type="button"
                            onClick={() => goto("google")}
                            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-white border border-slate-300 rounded-full text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 hover:shadow-sm active:scale-[0.99] transition-all"
                        >
                            <GoogleIcon className="size-4.5 shrink-0" />
                            Continue with Google
                        </button>
                    </div>
                    <div className="flex items-center gap-3 my-5">
                        <div className="h-px flex-1 bg-slate-200" />
                        <span className="text-xs text-slate-400">or</span>
                        <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-5 text-sm">
                        {!loginState && (
                            <div>
                                <label className="block mb-1.5">Nom</label>
                                <div className="relative">
                                    <User2Icon className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input type="text" required placeholder="Entrez votre nom" className="w-full pl-10 pr-4 py-2.5 bg-slate-50 outline-slate-300 border border-slate-200 rounded-full" value={name} onChange={(e) => setName(e.target.value)} />
                                </div>
                            </div>
                        )}
                        <div>
                            <label className="block mb-1.5">Adresse e-mail</label>
                            <div className="relative">
                                <MailIcon className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="email" required placeholder="vous@entreprise.com" className="w-full pl-10 pr-4 py-2.5 bg-slate-50 outline-slate-300 border border-slate-200 rounded-full" value={email} onChange={(e) => setEmail(e.target.value)} />
                            </div>
                        </div>
                        <div>
                            <label className="block mb-1.5">Mot de passe</label>
                            <div className="relative">
                                <LockIcon className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="password" required placeholder="********" className="w-full pl-10 pr-4 py-2.5 bg-slate-50 outline-slate-300 border border-slate-200 rounded-full" value={password} onChange={(e) => setPassword(e.target.value)} />
                            </div>
                        </div>

                        <button type="submit" disabled={loading} className="w-full py-2.5 px-4 bg-linear-to-r from-primary-600 to-primary-500 text-white rounded-full text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer">
                            {loading ? (
                                loginState ? "Connexion..." : "Inscription..."
                            ) : (
                                <>
                                    {loginState ? "Se connecter" : "S'inscrire"} <ArrowRightIcon className="size-4" />
                                </>
                            )}
                        </button>

                        <div className="relative flex py-2 items-center">
                            <div className="grow border-t border-slate-200"></div>
                            <span className="shrink mx-4 text-slate-400 text-xs uppercase">ou</span>
                            <div className="grow border-t border-slate-200"></div>
                        </div>

                        <button
                            type="button"
                            onClick={handleGoogleAuth}
                            className="w-full py-2.5 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-full text-sm font-medium transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <svg className="size-4 shrink-0" viewBox="0 0 24 24">
                                <path
                                    fill="#EA4335"
                                    d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.19 2.698 1.24 6.65l4.026 3.115Z"
                                />
                                <path
                                    fill="#34A853"
                                    d="M16.04 15.345c-1.063.72-2.41 1.164-4.04 1.164-3.037 0-5.61-2.007-6.528-4.718L1.385 14.86C3.385 18.89 7.427 21.7 12 21.7c3.155 0 5.927-1.018 7.9-2.782l-3.86-3.573Z"
                                />
                                <path
                                    fill="#4285F4"
                                    d="M23.49 12c0-.8-.09-1.57-.25-2.318H12v4.545h6.464c-.318 1.636-1.255 3.018-2.618 3.9l3.86 3.573c2.254-2.073 3.782-5.127 3.782-8.7Z"
                                />
                                <path
                                    fill="#FBBC05"
                                    d="M5.472 11.782c-.227-.682-.355-1.409-.355-2.164 0-.755.128-1.482.355-2.164L1.446 4.34C.527 6.18 0 8.24 0 10.42c0 2.18.527 4.24 1.446 6.08l4.026-3.118Z"
                                />
                            </svg>
                            {loginState ? "Se connecter avec Google" : "S'inscrire avec Google"}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-slate-500">
                        {loginState ? (
                            <>
                                Vous n'avez pas de compte ?{" "}
                                <button onClick={() => setLoginState(false)} className="text-primary-600 hover:text-primary-700 cursor-pointer">
                                    Créez-en un gratuitement
                                </button>
                            </>
                        ) : (
                            <>
                                Vous avez déjà un compte ?{" "}
                                <button onClick={() => setLoginState(true)} className="text-primary-600 hover:text-primary-700 cursor-pointer">
                                    Se connecter
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
