import { CheckIcon, CircleCheckBigIcon } from "lucide-react";
import { Link } from "react-router-dom";

const pricingPlans = [
    {
        name: "Starter",
        price: "Gratuit",
        period: "",
        description: "Idéal pour les créateurs qui débutent dans l'automatisation des réseaux sociaux.",
        features: ["2 comptes sociaux", "10 messages planifiés/mois", "Contenu IA (5 crédits/mois)", "Tableau de bord de base"],
        cta: "Démarrer gratuitement",
        highlight: false,
    },
    {
        name: "Pro",
        price: "29 €",
        period: "/mois",
        description: "Tout ce dont vous avez besoin pour développer et automatiser votre présence sociale.",
        features: ["Comptes illimités", "Planification illimitée", "Contenu IA (200 crédits/mois)", "Support prioritaire"],
        cta: "Essai gratuit de 14 jours",
        highlight: true,
    },
    {
        name: "Agence",
        price: "79 €",
        period: "/mois",
        description: "Pour les équipes et agences qui gèrent plusieurs marques à grande échelle.",
        features: ["Tout ce qui est inclus dans Pro", "5 membres d'équipe", "Crédits IA illimités", "Personnalités IA personnalisées", "Support dédié"],
        cta: "Contacter le service commercial",
        highlight: false,
    },
];

export default function Pricing() {
    return (
        <section id="pricing" className="py-24 bg-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-16">
                    <div className="mb-6 inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/15 text-red-500 text-[11px] font-medium tracking-[0.06em] uppercase px-3.5 py-1.5 rounded-full">
                        <CircleCheckBigIcon className="size-3" />
                        Tarifs simples
                    </div>
                    <h2 className="font-serif font-medium text-4xl sm:text-5xl leading-tight text-gray-900">
                        Des plans pour chaque étape
                        <br />
                        <span className="text-red-400 italic">de croissance</span>
                    </h2>
                    <p className="mt-5 text-gray-500 max-w-md mx-auto">Commencez gratuitement, passez au forfait supérieur quand vous le souhaitez. Annulez à tout moment — sans frais cachés.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
                    {pricingPlans.map((plan) => (
                        <div key={plan.name} className={`rounded-2xl border p-7 flex flex-col gap-6 relative ${plan.highlight ? "bg-red-500 text-white border-red-400 shadow-2xl shadow-red-100" : "bg-white text-slate-900 border-slate-200"}`}>
                            {plan.highlight && <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs font-bold px-3.5 py-1.5 rounded-full">Le plus populaire</div>}
                            <div>
                                <div className={`text-sm font-semibold mb-1 ${plan.highlight ? "text-red-100" : "text-red-500"}`}>{plan.name}</div>
                                <div className="flex items-end gap-1">
                                    <span className="text-4xl font-bold">{plan.price}</span>
                                    <span className={`text-sm mb-1.5 ${plan.highlight ? "text-red-200" : "text-slate-400"}`}>{plan.period}</span>
                                </div>
                                <p className={`text-sm mt-2 leading-relaxed ${plan.highlight ? "text-red-100" : "text-slate-500"}`}>{plan.description}</p>
                            </div>

                            <ul className="space-y-2.5">
                                {plan.features.map((f) => (
                                    <li key={f} className="flex items-center gap-2.5 text-sm">
                                        <div className={`size-4 rounded-full flex items-center justify-center shrink-0 ${plan.highlight ? "bg-red-400" : "bg-red-50"}`}>
                                            <CheckIcon className={`w-2.5 h-2.5 ${plan.highlight ? "text-white" : "text-red-500"}`} />
                                        </div>
                                        <span className={plan.highlight ? "text-red-50" : "text-slate-600"}>{f}</span>
                                    </li>
                                ))}
                            </ul>

                            <Link to="/#" className={`mt-auto text-center font-semibold text-sm px-6 py-3 rounded-full cursor-pointer ${plan.highlight ? "bg-white text-red-500 hover:bg-red-50" : "bg-red-500 text-white hover:bg-red-600"}`}>
                                {plan.cta}
                            </Link>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
