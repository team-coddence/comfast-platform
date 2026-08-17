import { useEffect, useState } from "react";
import api from "../api/axios";
import { PLATFORMS, type Platform } from "../assets/assets";

// Fetches which social networks are active for this deployment (server-controlled via ENABLED_PLATFORMS)
// and filters the static PLATFORMS list down to just those.
export const useEnabledPlatforms = (): Platform[] => {
  const [enabledIds, setEnabledIds] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/api/accounts/platforms");
        if (!cancelled) setEnabledIds(data.platforms);
      } catch {
        if (!cancelled) setEnabledIds(PLATFORMS.map((p) => p.id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (enabledIds === null) return [];
  return PLATFORMS.filter((p) => enabledIds.includes(p.id));
};
