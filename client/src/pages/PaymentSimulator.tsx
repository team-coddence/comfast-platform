import { useEffect, useState } from "react";
import { CheckCircle2Icon, FlaskConicalIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { PAYMENT_STATUS_LABELS, isPaymentOpen, type Payment } from "../lib/billing";

// Stands in for the processor's own page while payments are simulated.
//
// It exists so the whole billing flow — checkout, settlement, subscription
// extension, receipts — is exercisable without a merchant account. The server
// refuses to settle anything here that a real processor created, and refuses to
// boot in production with simulated payments enabled.

const PaymentSimulator = () => {
    const { reference } = useParams<{ reference: string }>();
    const navigate = useNavigate();

    const [payment, setPayment] = useState<Payment | null>(null)
    const [loading, setLoading] = useState(true)
    const [settling, setSettling] = useState<"succeeded" | "failed" | null>(null)

    useEffect(() => {
        if (!reference) return;

        api.get<Payment>(`/api/billing/payments/${reference}`)
            .then(({ data }) => setPayment(data))
            .catch(() => toast.error("Paiement introuvable"))
            .finally(() => setLoading(false));
    }, [reference])

    const settle = async (outcome: "succeeded" | "failed") => {
        setSettling(outcome);
        try {
            await api.post(`/api/billing/payments/${reference}/simulate`, { outcome });
            // Back to billing with the reference, which is exactly the return
            // trip a real processor makes — same code path, same polling.
            navigate(`/billing?reference=${reference}`, { replace: true });
        } catch (error: any) {
            toast.error(error?.response?.data?.message || "Simulation impossible");
            setSettling(null);
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <div className="size-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (!payment) {
        return (
            <div className="max-w-lg bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <p className="text-slate-600">Ce paiement n'existe pas dans cet espace de travail.</p>
                <button onClick={() => navigate("/billing")} className="mt-4 text-sm text-red-500 hover:text-red-600">
                    Retour à l'abonnement
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-lg space-y-4">
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
                <FlaskConicalIcon className="size-4 shrink-0" />
                Environnement de test — aucun montant ne sera réellement débité.
            </div>

            <div className="bg-white rounded-2xl border border-slate-200">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-slate-800">Simuler le paiement</h2>
                    <p className="text-sm text-slate-400 mt-0.5">Référence {payment.reference}</p>
                </div>

                <dl className="p-6 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                        <dt className="text-slate-400">Formule</dt>
                        <dd className="text-slate-800">
                            {payment.planName} · {payment.interval === "yearly" ? "12 mois" : "1 mois"}
                        </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt className="text-slate-400">Montant</dt>
                        <dd className="text-slate-800">{payment.amountLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt className="text-slate-400">Moyen</dt>
                        <dd className="text-slate-800">
                            {payment.methodLabel}{payment.phone ? ` · ${payment.phone}` : ""}
                        </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt className="text-slate-400">Statut</dt>
                        <dd className="text-slate-800">{PAYMENT_STATUS_LABELS[payment.status]}</dd>
                    </div>
                </dl>

                {isPaymentOpen(payment.status) ? (
                    <div className="px-6 pb-6 flex flex-wrap gap-3">
                        <button
                            onClick={() => settle("succeeded")}
                            disabled={settling !== null}
                            className="inline-flex items-center gap-2 bg-emerald-500 text-white px-5 py-2.5 rounded-full text-sm hover:bg-emerald-600 disabled:opacity-50"
                        >
                            {settling === "succeeded"
                                ? <Loader2Icon className="size-4 animate-spin" />
                                : <CheckCircle2Icon className="size-4" />}
                            Paiement réussi
                        </button>
                        <button
                            onClick={() => settle("failed")}
                            disabled={settling !== null}
                            className="inline-flex items-center gap-2 border border-slate-200 text-slate-600 px-5 py-2.5 rounded-full text-sm hover:bg-slate-50 disabled:opacity-50"
                        >
                            {settling === "failed"
                                ? <Loader2Icon className="size-4 animate-spin" />
                                : <XCircleIcon className="size-4" />}
                            Paiement échoué
                        </button>
                    </div>
                ) : (
                    <div className="px-6 pb-6">
                        <button onClick={() => navigate("/billing")} className="text-sm text-red-500 hover:text-red-600">
                            Ce paiement est déjà clos — retour à l'abonnement
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default PaymentSimulator;
