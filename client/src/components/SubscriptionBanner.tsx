import { AlertTriangleIcon, ClockIcon, SparklesIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSubscription } from "../context/SubscriptionContext";
import { subscriptionHeadline } from "../lib/billing";

// The one line that tells someone where they stand: days left in the trial,
// or why publishing just stopped working.
//
// Rendered under the top bar on every page except the billing page itself —
// repeating "your trial is ending" above the checkout the customer is already
// filling in is noise, not urgency.

const TONES = {
    info: {
        wrapper: "bg-red-50 border-red-100 text-red-700",
        button: "bg-red-500 text-white hover:bg-red-600",
        Icon: ClockIcon,
    },
    warning: {
        wrapper: "bg-amber-50 border-amber-200 text-amber-800",
        button: "bg-amber-500 text-white hover:bg-amber-600",
        Icon: AlertTriangleIcon,
    },
} as const;

const SubscriptionBanner = () => {
    const { subscription, isLoading } = useSubscription();
    const location = useLocation();

    if (isLoading || !subscription) return null;
    if (location.pathname.startsWith("/billing")) return null;

    const headline = subscriptionHeadline(subscription);
    if (!headline) return null;

    // Anything the customer can still work through is informational; a stopped
    // workspace gets the louder treatment.
    const tone = subscription.isActive ? TONES.info : TONES.warning;
    const { Icon } = tone;

    return (
        <div className={`flex flex-wrap items-center gap-3 px-4 md:px-8 py-2.5 border-b text-sm ${tone.wrapper}`}>
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 min-w-[12rem]">{headline}</span>
            <Link
                to="/billing"
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${tone.button}`}
            >
                <SparklesIcon className="size-3.5" />
                {subscription.isActive
                    ? "Choisir un abonnement"
                    // "Réactiver" only makes sense for someone who had a
                    // subscription; an expired trial was never active.
                    : subscription.status === "canceled" ? "Réactiver" : "S'abonner"}
            </Link>
        </div>
    )
}

export default SubscriptionBanner;
