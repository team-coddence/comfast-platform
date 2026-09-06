import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api, { SUBSCRIPTION_REQUIRED_EVENT } from "../api/axios";
import { useAuth } from "./AuthContext";
import { useWorkspace } from "./WorkspaceContext";
import type { Subscription } from "../lib/billing";

// The active workspace's entitlement, fetched once per workspace and refreshed
// whenever the server says it changed.
//
// It is an affordance layer only. Nothing here decides what the customer may
// do — the server refuses the request with 402 regardless of what this state
// says. Its job is to stop the app offering an action that is going to be
// refused, and to say clearly why.

interface SubscriptionContextType {
    subscription: Subscription | null;
    isLoading: boolean;
    /** True while the trial or a paid period is running. */
    isActive: boolean;
    refresh: () => Promise<Subscription | null>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined)

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const { activeWorkspaceId, isLoading: workspaceLoading } = useWorkspace();

    const [subscription, setSubscription] = useState<Subscription | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const refresh = useCallback(async (): Promise<Subscription | null> => {
        if (!isAuthenticated) return null;

        try {
            const { data } = await api.get<Subscription>("/api/billing/subscription");
            setSubscription(data);
            return data;
        } catch {
            // A failed lookup must not lock anyone out of the app: leave the
            // previous state, let the server be the one to refuse.
            return null;
        }
    }, [isAuthenticated])

    // Gated on both providers settling, and keyed on the workspace: switching
    // tenants must not show the previous workspace's trial countdown.
    useEffect(() => {
        if (authLoading || workspaceLoading) return;

        if (!isAuthenticated || !activeWorkspaceId) {
            setSubscription(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        refresh().finally(() => setIsLoading(false));
    }, [authLoading, workspaceLoading, isAuthenticated, activeWorkspaceId, refresh])

    // Raised by the API client on any 402 SUBSCRIPTION_REQUIRED. Without this,
    // an expired workspace keeps rendering "trial: 1 day left" until the next
    // reload, while every write silently fails.
    useEffect(() => {
        const handler = () => { refresh() };
        window.addEventListener(SUBSCRIPTION_REQUIRED_EVENT, handler);
        return () => window.removeEventListener(SUBSCRIPTION_REQUIRED_EVENT, handler);
    }, [refresh])

    return (
        <SubscriptionContext.Provider value={{
            subscription,
            isLoading,
            // Optimistic while loading: assuming "expired" would flash a
            // paywall in front of paying customers on every page load.
            isActive: subscription?.isActive ?? true,
            refresh,
        }}>
            {children}
        </SubscriptionContext.Provider>
    )
}

export const useSubscription = () => {
    const context = useContext(SubscriptionContext);
    if (context === undefined) {
        throw new Error("useSubscription must be used within a SubscriptionProvider");
    }
    return context;
}
