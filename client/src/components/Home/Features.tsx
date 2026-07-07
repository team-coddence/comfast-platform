import { CalendarDaysIcon, Wand2Icon, Share2Icon, ZapIcon, BarChart3Icon, HashIcon } from "lucide-react";

const features = [
    {
        icon: CalendarDaysIcon,
        title: "Planification intelligente",
        description: "Mettez vos messages en file d'attente sur toutes les plateformes en un seul clic. Configurez-le une fois et laissez-nous faire le reste.",
        color: "bg-red-50 text-red-500",
    },
    {
        icon: Wand2Icon,
        title: "Générateur de contenu par IA",
        description: "Générez des légendes adaptées à votre marque et des images époustouflantes grâce à notre IA intégrée. Ne restez plus jamais face à une page blanche.",
        color: "bg-red-50 text-red-500",
    },

    {
        icon: BarChart3Icon,
        title: "Tableau de bord d'activité",
        description: "Obtenez une vue d'ensemble de tous les messages publiés, du contenu planifié et de l'engagement en un seul endroit.",
        color: "bg-red-50 text-red-500",
    },
    {
        icon: Share2Icon,
        title: "Multi-plateforme",
        description: "Connectez Twitter, LinkedIn, Facebook et Instagram. Publiez partout depuis un espace de travail unifié.",
        color: "bg-red-50 text-red-500",
    },
    {
        icon: ZapIcon,
        title: "Publication instantanée",
        description: "Besoin de publier maintenant ? Publiez immédiatement ou planifiez pour les heures de forte affluence avec une prise en charge complète des fuseaux horaires.",
        color: "bg-red-50 text-red-500",
    },
    {
        icon: HashIcon,
        title: "Suggestions de hashtags",
        description: "Obtenez des suggestions de hashtags générées par l'IA pour toucher un public plus large.",
        color: "bg-red-50 text-red-500",
    },
];

export default function Features() {
    return (
        <section id="features" className="py-24 bg-slate-50">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-16">
                    <div className="mb-6 inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/15 text-red-500 text-[11px] font-medium tracking-[0.06em] uppercase px-3.5 py-1.5 rounded-full">
                        <ZapIcon className="size-3" />
                        Tout ce dont vous avez besoin
                    </div>
                    <h2 className="font-serif text-4xl sm:text-5xl font-medium leading-tight text-gray-900">
                        Automatisez tout votre
                        <br />
                        <span className="text-red-400 italic">flux de travail sur les réseaux sociaux</span>
                    </h2>
                    <p className="mt-5 text-gray-500 max-w-xl mx-auto leading-relaxed">De la création de contenu à la planification — Scheduler s'occupe de tout pour que vous puissiez vous concentrer sur l'essentiel.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {features.map((f) => (
                        <div key={f.title} className="bg-white rounded-2xl border border-slate-100 p-6 hover:border-slate-200 hover:shadow-md hover:shadow-slate-100 group">
                            <div className={`size-10 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>
                                <f.icon className="size-5" />
                            </div>
                            <h3 className=" text-slate-900 mb-2">{f.title}</h3>
                            <p className="text-sm text-slate-500/90 leading-relaxed">{f.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
