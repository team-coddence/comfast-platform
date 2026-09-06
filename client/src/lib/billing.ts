// Shapes returned by /api/billing, plus the formatting the billing screens
// share. Kept next to `roles.ts` for the same reason: these are contracts with
// the server, and every component that renders them should agree on the words.

export type BillingInterval = "monthly" | "yearly";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "expired" | "canceled";

export type PaymentMethodId = "mixx" | "flooz" | "card";

export type PaymentStatus = "pending" | "processing" | "succeeded" | "failed" | "canceled" | "expired";

export interface PlanPrice {
    amount: number;
    months: number;
    label: string;
}

export interface Plan {
    id: string;
    name: string;
    description: string;
    features: string[];
    prices?: Record<BillingInterval, PlanPrice>;
    limits: Record<string, number | null>;
}

export interface PaymentMethodInfo {
    id: PaymentMethodId;
    label: string;
    provider: string;
    providerLabel: string;
    requiresPhone: boolean;
    /** No money will move. The UI has to say so, loudly. */
    simulated: boolean;
    available: boolean;
    unavailableReason?: string;
}

export interface BillingCatalog {
    currency: string;
    trialDays: number;
    trialPlanId: string;
    paymentsMode: "auto" | "live" | "fake";
    plans: Plan[];
    methods: PaymentMethodInfo[];
}

export interface Payment {
    reference: string;
    plan: string;
    planName: string;
    interval: BillingInterval;
    amount: number;
    currency: string;
    amountLabel: string;
    method: PaymentMethodId;
    methodLabel: string;
    provider: string;
    simulated: boolean;
    status: PaymentStatus;
    failureReason?: string;
    phone?: string;
    redirectUrl?: string;
    instructions?: string;
    paidAt?: string;
    createdAt: string;
}

export interface Subscription {
    workspace: string;
    plan: string;
    planName: string;
    status: SubscriptionStatus;
    interval: BillingInterval | null;
    trialEndsAt: string;
    currentPeriodEnd: string | null;
    canceledAt: string | null;
    isActive: boolean;
    isTrialing: boolean;
    inGracePeriod: boolean;
    expiresAt: string;
    daysRemaining: number;
    trialDays: number;
    graceDays: number;
    limits: Record<string, number | null>;
    latestPayment?: Payment | null;
}

/** A payment that may still change state, and is therefore worth polling. */
export const isPaymentOpen = (status: PaymentStatus): boolean =>
    status === "pending" || status === "processing";

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
    trialing: "Essai gratuit",
    active: "Actif",
    past_due: "Paiement en retard",
    expired: "Expiré",
    canceled: "Résilié",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
    pending: "En attente",
    processing: "En cours",
    succeeded: "Payé",
    failed: "Échoué",
    canceled: "Annulé",
    expired: "Expiré",
};

/**
 * "5 000 F CFA". Mirrors the server's formatting so receipts match the UI.
 * fr-FR groups with a narrow no-break space (U+202F), which renders as a
 * missing glyph in some fonts — swapped here for a plain space.
 */
export const formatAmount = (amount: number, currency = "XOF"): string =>
    `${amount.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} ${currency === "XOF" ? "F CFA" : currency}`;

export const formatDate = (value: string | null | undefined): string =>
    value
        ? new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
        : "—";

/** "3 jours", "1 jour", "aujourd'hui" — the countdown in the trial banner. */
export const formatRemaining = (days: number): string => {
    if (days <= 0) return "aujourd'hui";
    if (days === 1) return "1 jour";
    return `${days} jours`;
};

/**
 * The single sentence shown in the header banner. Null means there is nothing
 * worth interrupting the customer about.
 */
export const subscriptionHeadline = (subscription: Subscription | null): string | null => {
    if (!subscription) return null;

    switch (subscription.status) {
        case "trialing":
            return `Essai gratuit — il reste ${formatRemaining(subscription.daysRemaining)}.`;
        case "past_due":
            return `Votre abonnement a expiré. Il vous reste ${formatRemaining(subscription.daysRemaining + subscription.graceDays)} avant la suspension.`;
        case "expired":
            return "Votre période d'essai est terminée. Choisissez un abonnement pour continuer à publier.";
        case "canceled":
            return "Votre abonnement est résilié. Réactivez-le pour continuer à publier.";
        case "active":
            // Only worth a word when it is about to lapse.
            return subscription.daysRemaining <= 5
                ? `Votre abonnement ${subscription.planName} se termine dans ${formatRemaining(subscription.daysRemaining)}.`
                : null;
        default:
            return null;
    }
};
