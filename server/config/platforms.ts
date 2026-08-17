export const ALL_PLATFORMS = ["twitter", "linkedin", "facebook", "instagram", "tiktok"] as const;

export type PlatformId = typeof ALL_PLATFORMS[number];

// ENABLED_PLATFORMS="twitter,linkedin" restricts which social networks are active.
// Unset or empty means all platforms are enabled.
export const getEnabledPlatforms = (): PlatformId[] => {
    const raw = process.env.ENABLED_PLATFORMS?.trim();
    if (!raw) return [...ALL_PLATFORMS];

    const requested = raw.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
    const enabled = requested.filter((p): p is PlatformId => (ALL_PLATFORMS as readonly string[]).includes(p));

    return enabled.length > 0 ? enabled : [...ALL_PLATFORMS];
}

export const isPlatformEnabled = (platform: string): boolean => {
    return getEnabledPlatforms().includes(platform?.toLowerCase() as PlatformId);
}
