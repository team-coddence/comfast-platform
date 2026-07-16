import { StarIcon } from "lucide-react";

const testimonials = [
    {
        name: "Sarah K.",
        role: "Responsable Marketing",
        avatar: "S",
        avatarBg: "from-primary-400 to-emerald-400",
        text: "Scheduler a fait gagner plus de 10 heures par semaine à notre équipe. Le compositeur IA est vraiment impressionnant — il écrit du contenu qui nous ressemble.",
    },
    {
        name: "Marcus L.",
        role: "Créateur Indépendant",
        avatar: "M",
        avatarBg: "from-violet-400 to-purple-500",
        text: "Avant, je redoutais de publier. Maintenant, je planifie une semaine entière de contenu en 20 minutes. La planification intelligente vaut le coup à elle seule.",
    },
    {
        name: "Priya D.",
        role: "Fondatrice de Startup",
        avatar: "P",
        avatarBg: "from-sky-400 to-blue-500",
        text: "Enfin un planificateur qui est à la fois beau ET puissant. Le tableau de bord épuré permet de voir facilement ce qui est publié et quand.",
    },
];

export default function Testimonials() {
    return (
        <section className="py-24 bg-slate-50">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-14">
                    <div className="mb-6 inline-flex items-center gap-1.5 bg-primary-500/10 border border-primary-500/15 text-primary-500 text-[11px] font-medium tracking-[0.06em] uppercase px-3.5 py-1.5 rounded-full">
                        <StarIcon className="size-3 " />
                        Témoignages
                    </div>
                    <h2 className="font-serif font-medium text-4xl sm:text-5xl leading-tight text-gray-900">
                        Aimé par les <span className="text-primary-500 ">créateurs &amp; équipes</span>
                    </h2>
                    <p className="mt-5 text-gray-500 max-w-md mx-auto">Rejoignez des milliers de personnes qui automatisent leurs réseaux sociaux avec Scheduler.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {testimonials.map((t, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-lg hover:shadow-slate-100 p-6 transition-all flex flex-col gap-4">
                            <p className="text-slate-600 text-sm leading-relaxed flex-1">"{t.text}"</p>
                            <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                                <div className={`size-9 rounded-full bg-linear-to-br ${t.avatarBg} flex items-center justify-center text-white text-sm font-bold shrink-0`}>{t.avatar}</div>
                                <div>
                                    <div className="text-sm font-medium text-slate-900">{t.name}</div>
                                    <div className="text-xs text-slate-400">{t.role}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
