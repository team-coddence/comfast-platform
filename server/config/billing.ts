// The plan catalogue and the money rules that go with it.
//
// Prices live here rather than in the database on purpose: they are a product
// decision that must be reviewable in a diff, and a plan a customer is paying
// for must never change under them because someone edited a Mongo document.
// What a workspace actually owes is frozen onto the Payment at checkout time,
// so editing a price here only affects future purchases.
//
// Currency is XOF (Franc CFA BCEAO) — an ISO-4217 zero-decimal currency, so
// every amount in this codebase is a whole number of francs. There are no
// "minor units" to divide by, which is exactly why nothing here uses cents.

import { env } from "./env.js";

export const CURRENCY = env.billing.currency;

export type BillingInterval = "monthly" | "yearly";

export const BILLING_INTERVALS = ["monthly", "yearly"] as const;

export interface PlanPrice {
    /** Whole francs. */
    amount: number;
    /** How much subscription time one payment buys. */
    months: number;
}

export interface Plan {
    id: string;
    name: string;
    description: string;
    features: string[];
    /** Absent on the trial plan: it cannot be bought. */
    prices?: Record<BillingInterval, PlanPrice>;
    /** Server-side quotas. `null` means unlimited. */
    limits: {
        socialAccounts: number | null;
        scheduledPostsPerMonth: number | null;
        aiGenerationsPerDay: number | null;
        members: number | null;
    };
}

/**
 * The plan every workspace starts on. It is not purchasable — it expires after
 * `env.billing.trialDays` and the workspace must then subscribe.
 */
export const TRIAL_PLAN_ID = "free";

export const PLANS: Plan[] = [
    {
        id: TRIAL_PLAN_ID,
        name: "Essai gratuit",
        description: `Toutes les fonctionnalités pendant ${env.billing.trialDays} jours, sans moyen de paiement.`,
        features: [
            "Toutes les fonctionnalités du plan Pro",
            "2 comptes sociaux",
            "Aucune carte requise",
        ],
        limits: { socialAccounts: 2, scheduledPostsPerMonth: 30, aiGenerationsPerDay: 10, members: 2 },
    },
    {
        id: "pro",
        name: "Pro",
        description: "Pour les créateurs et petites entreprises qui publient chaque jour.",
        features: [
            "Comptes sociaux illimités",
            "Planification illimitée",
            "200 générations IA / jour",
            "Calendrier de publication",
            "Support prioritaire",
        ],
        // Yearly is priced at ten months: two months free, as advertised.
        prices: {
            monthly: { amount: 5_000, months: 1 },
            yearly: { amount: 50_000, months: 12 },
        },
        limits: { socialAccounts: null, scheduledPostsPerMonth: null, aiGenerationsPerDay: 200, members: 3 },
    },
    {
        id: "agency",
        name: "Agence",
        description: "Pour les équipes et agences qui gèrent plusieurs marques.",
        features: [
            "Tout le plan Pro",
            "10 membres par espace de travail",
            "Générations IA illimitées",
            "Rapports et exports",
            "Accompagnement dédié",
        ],
        prices: {
            monthly: { amount: 15_000, months: 1 },
            yearly: { amount: 150_000, months: 12 },
        },
        limits: { socialAccounts: null, scheduledPostsPerMonth: null, aiGenerationsPerDay: null, members: 10 },
    },
];

const planById = new Map(PLANS.map((p) => [p.id, p]));

export const getPlan = (id: string | undefined | null): Plan | undefined =>
    id ? planById.get(id) : undefined;

/** Plans a customer can actually pay for — i.e. everything but the trial. */
export const getPurchasablePlans = (): Plan[] => PLANS.filter((p) => p.prices);

export const getPrice = (planId: string, interval: BillingInterval): PlanPrice | undefined =>
    getPlan(planId)?.prices?.[interval];

export const isBillingInterval = (value: unknown): value is BillingInterval =>
    typeof value === "string" && (BILLING_INTERVALS as readonly string[]).includes(value);

/** "5 000 F CFA" — used in payment descriptions and provider dashboards. */
export const formatAmount = (amount: number): string =>
    `${amount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} ${CURRENCY === "XOF" ? "F CFA" : CURRENCY}`;

/**
 * Adds `months` calendar months to `from`, clamping the day of month so that
 * subscribing on the 31st does not silently skip a month (31 Jan + 1 month
 * would otherwise land on 3 March).
 */
export const addMonths = (from: Date, months: number): Date => {
    const result = new Date(from);
    const day = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + months);
    const lastDayOfTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDayOfTargetMonth));
    return result;
}

export const addDays = (from: Date, days: number): Date =>
    new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
