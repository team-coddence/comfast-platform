import { useEffect, useState } from "react";
import { CheckIcon, CircleCheckBigIcon } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import type { BillingCatalog, Plan } from "../../lib/billing";

// Driven by GET /api/billing/plans rather than a hard-coded list: the prices a
// visitor is quoted here and the prices they are charged at checkout come from
// the same place, so they cannot drift apart.
//
// The fallback below only covers the API being unreachable — a marketing page
// with an empty pricing section is worse than a slightly stale one.

const FALLBACK: Pick<BillingCatalog, "trialDays" | "plans"> = {
    trialDays: 3,
    plans: [
        {
            id: "pro", name: "Pro",
            description: "Pour les créateurs et petites entreprises qui publient chaque jour.",
            features: ["Comptes sociaux illimités", "Planification illimitée", "200 générations IA / jour"],
            prices: { monthly: { amount: 5000, months: 1, label: "5 000 F CFA" }, yearly: { amount: 50000, months: 12, label: "50 000 F CFA" } },
            limits: {},
        },
        {
            id: "agency", name: "Agence",
            description: "Pour les équipes et agences qui gèrent plusieurs marques.",
            features: ["Tout le plan Pro", "10 membres", "Générations IA illimitées"],
            prices: { monthly: { amount: 15000, months: 1, label: "15 000 F CFA" }, yearly: { amount: 150000, months: 12, label: "150 000 F CFA" } },
            limits: {},
        },
    ],
}

export default function Pricing() {
    const [catalog, setCatalog] = useState<Pick<BillingCatalog, "trialDays" | "plans">>(FALLBACK)

    useEffect(() => {
        api.get<BillingCatalog>("/api/billing/plans")
            .then(({ data }) => setCatalog(data))
            .catch(() => { /* keep the fallback */ });
    }, [])

    const trialPlan = catalog.plans.find((plan) => !plan.prices);
    const paidPlans = catalog.plans.filter((plan): plan is Plan & { prices: NonNullable<Plan["prices"]> } => Boolean(plan.prices));

    // The trial always leads, then the paid plans; the middle one is featured.
    const cards = [
        {
            id: "trial",
            name: trialPlan?.name ?? "Essai gratuit",
            price: "0 F",
            period: `pendant ${catalog.trialDays} jours`,
            description: trialPlan?.description ?? `Toutes les fonctionnalités pendant ${catalog.trialDays} jours, sans moyen de paiement.`,
            features: trialPlan?.features ?? ["Aucune carte requise", "Annulable à tout moment"],
            cta: "Commencer gratuitement",
            to: "/login",
            highlight: false,
        },
        ...paidPlans.map((plan, index) => ({
            id: plan.id,
            name: plan.name,
            price: plan.prices.monthly.label,
            period: "/ mois",
            description: `${plan.description} Ou ${plan.prices.yearly.label} par an — deux mois offerts.`,
            features: plan.features,
            cta: `Choisir ${plan.name}`,
            to: "/billing",
            highlight: index === 0,
        })),
    ];

    return (
        <section id="pricing" className="py-24 bg-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-16">
                    <div className="mb-6 inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/15 text-red-500 text-[11px] font-medium tracking-[0.06em] uppercase px-3.5 py-1.5 rounded-full">
                        <CircleCheckBigIcon className="size-3" />
                        Tarifs simples
                    </div>
                    <h2 className="font-serif font-medium text-4xl sm:text-5xl leading-tight text-gray-900">
                        Des offres pour chaque étape
                        <br />
                        <span className="text-red-400 italic">de votre croissance</span>
                    </h2>
                    <p className="mt-5 text-gray-500 max-w-md mx-auto">
                        {catalog.trialDays} jours d'essai gratuit, puis paiement par Mixx By Yas, Flooz ou carte bancaire.
                        Sans engagement.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
                    {cards.map((plan) => (
                        <div key={plan.id} className={`rounded-2xl border p-7 flex flex-col gap-6 relative ${plan.highlight ? "bg-red-500 text-white border-red-400 shadow-2xl shadow-red-100" : "bg-white text-slate-900 border-slate-200"}`}>
                            {plan.highlight && <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs font-bold px-3.5 py-1.5 rounded-full">Le plus choisi</div>}
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

                            <Link to={plan.to} className={`mt-auto text-center font-semibold text-sm px-6 py-3 rounded-full ${plan.highlight ? "bg-white text-red-500 hover:bg-red-50" : "bg-red-500 text-white hover:bg-red-600"}`}>
                                {plan.cta}
                            </Link>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
