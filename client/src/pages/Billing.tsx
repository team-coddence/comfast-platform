import { useCallback, useEffect, useRef, useState } from "react";
import {
    BadgeCheckIcon, CheckIcon, CreditCardIcon, FlaskConicalIcon, InfoIcon, Loader2Icon,
    ShieldCheckIcon, SmartphoneIcon, XIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useWorkspace } from "../context/WorkspaceContext";
import { useSubscription } from "../context/SubscriptionContext";
import {
    formatDate, formatRemaining, isPaymentOpen, PAYMENT_STATUS_LABELS, SUBSCRIPTION_STATUS_LABELS,
    type BillingCatalog, type BillingInterval, type Payment, type PaymentMethodId, type Plan,
} from "../lib/billing";

// Checkout, subscription status and payment history for the active workspace.
//
// The shape of the flow is dictated by mobile money: there is no redirect and
// no synchronous answer. The customer approves a USSD prompt on their handset
// and we find out by polling — which is also what makes the card flow work when
// the customer closes the processor's tab instead of coming back.

/** How often the checkout screen asks the server for the payment's outcome. */
const POLL_INTERVAL_MS = 4000;

const METHOD_ICONS: Record<PaymentMethodId, typeof SmartphoneIcon> = {
    mixx: SmartphoneIcon,
    flooz: SmartphoneIcon,
    card: CreditCardIcon,
};

const Card = ({ title, description, children, actions }: {
    title: string;
    description?: string;
    children: React.ReactNode;
    actions?: React.ReactNode;
}) => (
    <section className="bg-white rounded-2xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-start gap-4">
            <div className="flex-1">
                <h2 className="text-slate-800">{title}</h2>
                {description && <p className="text-sm text-slate-400 mt-0.5">{description}</p>}
            </div>
            {actions}
        </div>
        {children}
    </section>
)

const StatusPill = ({ label, tone }: { label: string; tone: "ok" | "warn" | "bad" | "muted" }) => {
    const tones = {
        ok: "bg-emerald-50 text-emerald-700 border-emerald-100",
        warn: "bg-amber-50 text-amber-700 border-amber-200",
        bad: "bg-red-50 text-red-600 border-red-100",
        muted: "bg-slate-50 text-slate-500 border-slate-200",
    } as const;
    return <span className={`text-xs px-2.5 py-1 rounded-full border ${tones[tone]}`}>{label}</span>
}

const Billing = () => {
    const { can } = useWorkspace();
    const { subscription, refresh: refreshSubscription } = useSubscription();
    const canPay = can("admin");
    const isOwner = can("owner");

    const [searchParams, setSearchParams] = useSearchParams();

    const [catalog, setCatalog] = useState<BillingCatalog | null>(null)
    const [loading, setLoading] = useState(true)

    const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly")
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
    const [method, setMethod] = useState<PaymentMethodId | null>(null)
    const [phone, setPhone] = useState("")

    const [payment, setPayment] = useState<Payment | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [history, setHistory] = useState<Payment[]>([])

    // Guards the one-shot toast when a payment reaches a final state: the poll
    // and the manual refresh both land on the same transition.
    const settledRef = useRef<string | null>(null)

    const loadHistory = useCallback(async () => {
        if (!canPay) return;
        try {
            const { data } = await api.get<Payment[]>("/api/billing/payments");
            setHistory(data);
        } catch {
            // History is a nicety; a failure here must not break checkout.
        }
    }, [canPay])

    useEffect(() => {
        const load = async () => {
            try {
                const { data } = await api.get<BillingCatalog>("/api/billing/plans");
                setCatalog(data);

                const purchasable = data.plans.filter((p) => p.prices);
                setSelectedPlan((current) => current ?? purchasable[0]?.id ?? null);
                setMethod((current) => current ?? data.methods.find((m) => m.available)?.id ?? null);
            } catch (error: any) {
                toast.error(error?.response?.data?.message || "Impossible de charger les offres");
            } finally {
                setLoading(false);
            }
        };

        load();
        loadHistory();
    }, [loadHistory])

    // Coming back from a hosted checkout page. The return is a navigation the
    // customer controls, so it proves nothing — it only tells us which payment
    // to go and ask the server about.
    useEffect(() => {
        const reference = searchParams.get("reference");
        if (!reference) return;

        setSearchParams({}, { replace: true });

        api.get<Payment>(`/api/billing/payments/${reference}`)
            .then(({ data }) => setPayment(data))
            .catch(() => toast.error("Paiement introuvable"));
    }, [searchParams, setSearchParams])

    // Poll while the payment can still change: the customer is either holding
    // their phone or sitting on the processor's page.
    useEffect(() => {
        if (!payment || !isPaymentOpen(payment.status)) return;

        const reference = payment.reference;
        const timer = window.setInterval(async () => {
            try {
                const { data } = await api.get<Payment>(`/api/billing/payments/${reference}`);
                setPayment(data);
            } catch {
                // Transient: keep polling rather than dropping the customer on
                // a dead screen mid-payment.
            }
        }, POLL_INTERVAL_MS);

        return () => window.clearInterval(timer);
    }, [payment])

    // React to the transition, once, whatever observed it first.
    useEffect(() => {
        if (!payment || isPaymentOpen(payment.status)) return;
        if (settledRef.current === payment.reference) return;
        settledRef.current = payment.reference;

        if (payment.status === "succeeded") {
            toast.success("Paiement confirmé — votre abonnement est actif.");
            refreshSubscription();
        } else {
            toast.error(payment.failureReason || `Paiement ${PAYMENT_STATUS_LABELS[payment.status].toLowerCase()}`);
        }
        loadHistory();
    }, [payment, refreshSubscription, loadHistory])

    const selectedMethod = catalog?.methods.find((m) => m.id === method);

    const handleCheckout = async () => {
        if (!selectedPlan || !method) return;

        setSubmitting(true);
        try {
            const { data } = await api.post<Payment>("/api/billing/checkout", {
                plan: selectedPlan,
                interval: billingInterval,
                method,
                ...(selectedMethod?.requiresPhone ? { phone } : {}),
            });

            settledRef.current = null;
            setPayment(data);

            // A hosted page (card, or the simulator) takes over from here.
            if (data.redirectUrl) {
                window.location.href = data.redirectUrl;
                return;
            }

            toast.success(data.instructions || "Validez le paiement sur votre téléphone");
        } catch (error: any) {
            toast.error(error?.response?.data?.message || "Le paiement n'a pas pu être lancé");
        } finally {
            setSubmitting(false);
        }
    }

    const handleCancelPayment = async () => {
        if (!payment) return;
        try {
            const { data } = await api.post<Payment>(`/api/billing/payments/${payment.reference}/cancel`);
            setPayment(data);
            toast("Paiement annulé");
        } catch (error: any) {
            toast.error(error?.response?.data?.message || "Impossible d'annuler ce paiement");
        }
    }

    const handleSubscriptionAction = async (action: "cancel" | "resume") => {
        try {
            await api.post(`/api/billing/subscription/${action}`);
            await refreshSubscription();
            toast.success(action === "cancel"
                ? "Renouvellement arrêté. Votre accès reste actif jusqu'à la fin de la période."
                : "Renouvellement réactivé");
        } catch (error: any) {
            toast.error(error?.response?.data?.message || "Action impossible");
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <div className="size-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    const purchasablePlans = catalog?.plans.filter((plan): plan is Plan & { prices: NonNullable<Plan["prices"]> } => Boolean(plan.prices)) ?? [];
    const openPayment = payment && isPaymentOpen(payment.status) ? payment : null;

    const statusTone = !subscription ? "muted"
        : subscription.status === "active" ? "ok"
        : subscription.status === "trialing" ? "ok"
        : subscription.status === "past_due" ? "warn"
        : "bad";

    return (
        <div className="max-w-5xl space-y-6">

            {/* Where this workspace stands today. */}
            <Card
                title="Abonnement"
                description="L'abonnement couvre tout l'espace de travail, pas seulement votre compte."
                actions={subscription
                    ? <StatusPill label={SUBSCRIPTION_STATUS_LABELS[subscription.status]} tone={statusTone} />
                    : undefined}
            >
                <div className="p-6 grid gap-6 sm:grid-cols-3">
                    <div>
                        <div className="text-xs uppercase tracking-wider text-slate-400">Formule</div>
                        <div className="text-slate-800 mt-1">{subscription?.planName ?? "—"}</div>
                        {subscription?.interval && (
                            <div className="text-xs text-slate-400 mt-0.5">
                                {subscription.interval === "yearly" ? "Facturation annuelle" : "Facturation mensuelle"}
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="text-xs uppercase tracking-wider text-slate-400">
                            {subscription?.isTrialing ? "Fin de l'essai" : "Prochaine échéance"}
                        </div>
                        <div className="text-slate-800 mt-1">{formatDate(subscription?.expiresAt)}</div>
                        {subscription && (
                            <div className="text-xs text-slate-400 mt-0.5">
                                {subscription.isActive
                                    ? `Il reste ${formatRemaining(subscription.daysRemaining)}`
                                    : "Accès suspendu"}
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="text-xs uppercase tracking-wider text-slate-400">Renouvellement</div>
                        <div className="text-slate-800 mt-1">
                            {subscription?.canceledAt ? "Arrêté" : subscription?.currentPeriodEnd ? "Actif" : "—"}
                        </div>
                        {isOwner && subscription?.currentPeriodEnd && (
                            <button
                                onClick={() => handleSubscriptionAction(subscription.canceledAt ? "resume" : "cancel")}
                                className="text-xs text-red-500 hover:text-red-600 mt-1"
                            >
                                {subscription.canceledAt ? "Réactiver le renouvellement" : "Arrêter le renouvellement"}
                            </button>
                        )}
                    </div>
                </div>

                {subscription?.isTrialing && (
                    <div className="px-6 pb-6 -mt-2">
                        <div className="flex items-start gap-2.5 text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                            <InfoIcon className="size-4 mt-0.5 shrink-0 text-slate-400" />
                            <p>
                                Vous êtes en essai gratuit de {subscription.trialDays} jours. Souscrire maintenant
                                conserve les jours restants : ils s'ajoutent à la période payée.
                            </p>
                        </div>
                    </div>
                )}
            </Card>

            {/* A payment in flight owns the screen until it settles. */}
            {openPayment && (
                <Card title="Paiement en cours" description={`Référence ${openPayment.reference}`}>
                    <div className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                        <Loader2Icon className="size-6 text-red-500 animate-spin shrink-0" />
                        <div className="flex-1">
                            <div className="text-slate-800">
                                {openPayment.amountLabel} · {openPayment.methodLabel}
                            </div>
                            <p className="text-sm text-slate-500 mt-1">
                                {openPayment.method === "card"
                                    ? "Terminez le paiement sur la page du prestataire. Cette page se met à jour automatiquement."
                                    : `Validez la demande sur le ${openPayment.phone ?? "téléphone"} ; cette page se met à jour automatiquement.`}
                            </p>
                            {openPayment.simulated && (
                                <a
                                    href={openPayment.redirectUrl}
                                    className="inline-flex items-center gap-1.5 text-xs text-amber-700 mt-2"
                                >
                                    <FlaskConicalIcon className="size-3.5" />
                                    Paiement simulé — ouvrir la page de simulation
                                </a>
                            )}
                        </div>
                        <button
                            onClick={handleCancelPayment}
                            className="text-sm text-slate-500 hover:text-red-500 inline-flex items-center gap-1.5"
                        >
                            <XIcon className="size-4" />
                            Annuler
                        </button>
                    </div>
                </Card>
            )}

            {/* Plan picker. */}
            <Card
                title="Choisir une formule"
                description={catalog ? `Paiement en ${catalog.currency === "XOF" ? "francs CFA" : catalog.currency}, sans engagement.` : undefined}
                actions={
                    <div className="flex rounded-full border border-slate-200 p-0.5 text-xs">
                        {(["monthly", "yearly"] as BillingInterval[]).map((value) => (
                            <button
                                key={value}
                                onClick={() => setBillingInterval(value)}
                                className={`px-3 py-1.5 rounded-full transition-colors ${billingInterval === value ? "bg-red-500 text-white" : "text-slate-500 hover:text-slate-700"}`}
                            >
                                {value === "monthly" ? "Mensuel" : "Annuel · 2 mois offerts"}
                            </button>
                        ))}
                    </div>
                }
            >
                <div className="p-6 grid gap-4 md:grid-cols-2">
                    {purchasablePlans.map((plan) => {
                        const price = plan.prices[billingInterval];
                        const isSelected = selectedPlan === plan.id;
                        const isCurrent = subscription?.plan === plan.id && subscription.status === "active";

                        return (
                            <button
                                key={plan.id}
                                onClick={() => setSelectedPlan(plan.id)}
                                className={`text-left rounded-2xl border p-5 transition-all ${isSelected ? "border-red-300 bg-red-50/40 ring-2 ring-red-100" : "border-slate-200 hover:border-slate-300"}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-800">{plan.name}</span>
                                    {isCurrent && <StatusPill label="Formule actuelle" tone="ok" />}
                                </div>
                                <div className="flex items-end gap-1.5 mt-2">
                                    <span className="text-2xl text-slate-900">{price.label}</span>
                                    <span className="text-sm text-slate-400 mb-1">
                                        {billingInterval === "yearly" ? "/ an" : "/ mois"}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-500 mt-2">{plan.description}</p>
                                <ul className="mt-4 space-y-1.5">
                                    {plan.features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                                            <CheckIcon className="size-3.5 text-red-500 mt-1 shrink-0" />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                            </button>
                        )
                    })}
                </div>
            </Card>

            {/* Method picker + the one field mobile money needs. */}
            <Card title="Moyen de paiement">
                <div className="p-6 space-y-5">
                    <div className="grid gap-3 sm:grid-cols-3">
                        {catalog?.methods.map((info) => {
                            const Icon = METHOD_ICONS[info.id];
                            const isSelected = method === info.id;

                            return (
                                <button
                                    key={info.id}
                                    disabled={!info.available}
                                    onClick={() => setMethod(info.id)}
                                    title={info.unavailableReason}
                                    className={`text-left rounded-xl border p-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isSelected ? "border-red-300 bg-red-50/40 ring-2 ring-red-100" : "border-slate-200 hover:border-slate-300"}`}
                                >
                                    <Icon className={`size-5 ${isSelected ? "text-red-500" : "text-slate-400"}`} />
                                    <div className="text-slate-800 mt-2">{info.label}</div>
                                    <div className="text-xs text-slate-400 mt-0.5">
                                        {info.available ? info.providerLabel : info.unavailableReason}
                                    </div>
                                    {info.simulated && (
                                        <div className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 mt-2">
                                            <FlaskConicalIcon className="size-3" />
                                            Simulé
                                        </div>
                                    )}
                                </button>
                            )
                        })}
                    </div>

                    {selectedMethod?.requiresPhone && (
                        <div>
                            <label className="block text-sm text-slate-600 mb-1.5">
                                Numéro {selectedMethod.label} à débiter
                            </label>
                            <input
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                inputMode="tel"
                                placeholder="90 12 34 56"
                                className="w-full sm:w-64 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-red-300 focus:ring-2 focus:ring-red-100 outline-none"
                            />
                            <p className="text-xs text-slate-400 mt-1.5">
                                8 chiffres. Les formats +228 et 00228 sont acceptés.
                            </p>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                            onClick={handleCheckout}
                            disabled={!canPay || submitting || !selectedPlan || !selectedMethod?.available || Boolean(openPayment)}
                            className="inline-flex items-center gap-2 bg-red-500 text-white px-5 py-2.5 rounded-full text-sm hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting
                                ? <Loader2Icon className="size-4 animate-spin" />
                                : <BadgeCheckIcon className="size-4" />}
                            Payer maintenant
                        </button>

                        {!canPay && (
                            <span className="text-sm text-slate-400">
                                Seuls les administrateurs de l'espace de travail peuvent payer.
                            </span>
                        )}
                        {canPay && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                                <ShieldCheckIcon className="size-3.5" />
                                Aucune donnée bancaire ne transite par nos serveurs.
                            </span>
                        )}
                    </div>
                </div>
            </Card>

            {/* Receipts. */}
            {canPay && history.length > 0 && (
                <Card title="Historique des paiements">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3 font-normal">Date</th>
                                    <th className="px-6 py-3 font-normal">Formule</th>
                                    <th className="px-6 py-3 font-normal">Moyen</th>
                                    <th className="px-6 py-3 font-normal">Montant</th>
                                    <th className="px-6 py-3 font-normal">Statut</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((item) => (
                                    <tr key={item.reference} className="border-b border-slate-50 last:border-0">
                                        <td className="px-6 py-3 text-slate-500 whitespace-nowrap">{formatDate(item.createdAt)}</td>
                                        <td className="px-6 py-3 text-slate-700">
                                            {item.planName}
                                            <span className="text-slate-400"> · {item.interval === "yearly" ? "an" : "mois"}</span>
                                        </td>
                                        <td className="px-6 py-3 text-slate-500">{item.methodLabel}</td>
                                        <td className="px-6 py-3 text-slate-700 whitespace-nowrap">{item.amountLabel}</td>
                                        <td className="px-6 py-3">
                                            <StatusPill
                                                label={PAYMENT_STATUS_LABELS[item.status]}
                                                tone={item.status === "succeeded" ? "ok" : isPaymentOpen(item.status) ? "warn" : "muted"}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    )
}

export default Billing;
