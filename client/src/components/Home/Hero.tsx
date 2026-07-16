import { Link } from "react-router-dom";
import { ArrowRightIcon, DotIcon } from "lucide-react";

export default function Hero() {
    return (
        <section className="relative overflow-hidden">
            {/* Subtle grid */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-size-[56px_56px] pointer-events-none" />

            {/* Green soft glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-225 h-140 bg-[radial-gradient(ellipse_at_center,rgba(1,175,62,0.08)_0%,transparent_70%)] pointer-events-none" />

            <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-20 pb-12 text-center">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 bg-primary-50 border border-primary-100 text-primary-500 text-sm px-3.5 py-1.5 rounded-full mb-8">
                    <span className="size-1.5 bg-primary-400 rounded-full" />
                    Automatisation des réseaux sociaux par l'IA
                </div>

                {/* Headline */}
                <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl xl:text-7xl text-slate-900">
                    Une seule plateforme pour piloter toute votre stratégie
                    <br />
                    <span className="text-primary-500 italic">social media.</span>
                </h1>

                {/* Subheadline */}
                <p className="mt-7 text-gray-500 max-w-2xl mx-auto">Comfast vous permet de créer, planifier et interagir automatiquement sur toutes vos plateformes sociales — propulsé par une IA qui écrit vos légendes et répond à vos commentaires pour vous.</p>

                {/* CTAs */}
                <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Link to="/login" className="bg-primary-500 text-white rounded-full font-medium hover:bg-primary-600 hover:shadow-[0_8px_24px_rgba(1,175,62,0.25)] inline-flex items-center gap-2 text-[15px] px-8 py-3.5 w-full sm:w-auto justify-center transition-all cursor-pointer">
                        Commencer gratuitement <ArrowRightIcon className="size-4" />
                    </Link>
                    <a href="#how-it-works" className="bg-transparent text-[#333] border-[1.5px] border-black/10 rounded-full font-medium hover:bg-black/5 hover:border-black/20 inline-flex items-center gap-2 text-[15px] px-8 py-3.5 w-full sm:w-auto backdrop-blur justify-center transition-all cursor-pointer">
                        Voir comment ça marche
                    </a>
                </div>

                <p className="mt-5 text-xs text-gray-400">Aucune carte de crédit requise · Plan gratuit à vie disponible</p>
            </div>

            {/* Dashboard mockup */}
            <div className="relative max-w-5xl mx-auto px-5 sm:px-8 pb-0">
                <div className="rounded-t-2xl overflow-hidden border border-gray-200 border-b-0">
                    {/* Browser chrome */}
                    <div className="flex items-center gap-2 px-4 py-3" style={{ background: "#f0f0f0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                        <div className="w-3 h-3 rounded-full bg-red-400" />
                        <div className="w-3 h-3 rounded-full bg-amber-400" />
                        <div className="w-3 h-3 rounded-full bg-emerald-400" />
                        <div className="flex-1 mx-4 rounded-md h-5 max-w-xs bg-white/80" />
                    </div>

                    {/* Mock content */}
                    <div className="p-6" style={{ background: "#f7f7f7" }}>
                        {/* Stat row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                            {[
                                { val: "12", label: "Planifiés" },
                                { val: "48", label: "Publiés" },
                                { val: "4", label: "Comptes" },
                                { val: "3", label: "Règles IA" },
                            ].map((s) => (
                                <div key={s.label} className="rounded-xl p-4 bg-white" style={{ border: "1px solid rgba(0,0,0,0.06)" }}>
                                    <div className="text-2xl font-bold text-gray-900 tabular-nums">{s.val}</div>
                                    <div className="text-xs text-gray-400 mt-1">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Activity list */}
                        <div className="rounded-xl p-4 space-y-3 bg-white" style={{ border: "1px solid rgba(0,0,0,0.06)" }}>
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Activité récente</div>
                            {[
                                { text: "Message publié sur LinkedIn et Twitter", time: "il y a 2 min" },
                                { text: "L'IA a répondu à 3 commentaires", time: "il y a 15 min" },
                                { text: "Nouveau message planifié pour demain à 9h", time: "il y a 1h" },
                            ].map((item) => (
                                <div key={item.text} className="flex items-center gap-3">
                                    <DotIcon className="size-5 text-gray-300" />
                                    <span className="text-sm text-gray-600 flex-1">{item.text}</span>
                                    <span className="text-xs text-gray-300 shrink-0">{item.time}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
