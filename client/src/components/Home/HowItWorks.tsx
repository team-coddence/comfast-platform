import { ArrowRightIcon, CheckCircleIcon } from "lucide-react";

const steps = [
    { step: "01", title: "Connectez vos comptes", description: "Associez vos profils sociaux en quelques secondes. Nous prenons en charge Twitter, LinkedIn, Facebook et Instagram." },
    { step: "02", title: "Créez ou générez du contenu", description: "Rédigez votre propre message ou laissez notre IA concevoir une légende et une image en fonction de vos idées." },
    { step: "03", title: "Planifiez et publiez", description: "Choisissez une heure, sélectionnez vos plateformes et cliquez sur planifier. Nous nous occupons de la publication automatiquement." },
];

export default function HowItWorks() {
    return (
        <section id="how-it-works" className="py-24 bg-white">
            <div className="max-w-4xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-16">
                    <div className="mb-6 inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/15 text-red-500 text-[11px] font-medium tracking-[0.06em] uppercase px-3.5 py-1.5 rounded-full">
                         <CheckCircleIcon className="size-3" />
                         Configuration simple
                    </div>
                    <h2 className="font-serif font-medium text-4xl sm:text-5xl leading-tight text-gray-900">
                        Prêt et opérationnel en <span className="text-red-400 italic">quelques minutes</span>
                    </h2>
                    <p className="mt-5 text-gray-500 max-w-lg mx-auto leading-relaxed">Pas d'intégration compliquée, pas d'apprentissage fastidieux. Connectez-vous, créez et grandissez.</p>
                </div>

                <div className="space-y-6">
                    {steps.map((s, i) => (
                        <div key={s.step} className="flex gap-6 items-start">
                            <div className="shrink-0 size-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
                                <span className="text-sm font-medium text-red-500">{s.step}</span>
                            </div>
                            <div className="pt-1">
                                <h3 className=" text-slate-900 mb-1">{s.title}</h3>
                                <p className="text-slate-500 text-sm leading-relaxed">{s.description}</p>
                            </div>
                            {i < steps.length - 1 && (
                                <div className="hidden sm:block ml-auto shrink-0 self-center">
                                    <ArrowRightIcon className="size-4 text-slate-200" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
