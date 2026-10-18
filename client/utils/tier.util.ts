const FALLBACK_TIER_COLORS: Record<string, string> = {
  business: 'conic-gradient(from 295deg, #8b5cf6 0% 28%, #ec4899 28% 57%, #3b82f6 57% 85%, #6366f1 85% 100%)',
  enterprise: 'conic-gradient(from 295deg, #8b5cf6 0% 28%, #ec4899 28% 57%, #3b82f6 57% 85%, #6366f1 85% 100%)',
  free: '#9ca3af',
  pro: '#3b82f6',
};

export function getFallbackTierColor(tier?: string): string {
  const normalized = (tier || 'free').toLowerCase();
  return FALLBACK_TIER_COLORS[normalized] || FALLBACK_TIER_COLORS.free;
}

export function applyAvatarTier(el: HTMLElement | null, tier?: string, color?: string): void {
  if (!el) return;
  const normalizedTier = (tier || 'free').toLowerCase();
  el.setAttribute('data-tier', normalizedTier);
  const tierColor = color || getFallbackTierColor(normalizedTier);
  el.style.setProperty('--avatar-tier-bg', tierColor);
  el.style.setProperty('--tier-border-color', tierColor);
}

