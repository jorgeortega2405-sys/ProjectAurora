import { SubscriptionTierId } from '../types/subscription.types.js';

export interface PlanBenefitDefinition {
  borderColor: string;
  currency: string;
  id: SubscriptionTierId;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  ringBg: string;
  tagline: string;
}

export const PLAN_TIER_CONFIGS: Record<SubscriptionTierId, PlanBenefitDefinition> = {
  free: {
    borderColor: '#9ca3af',
    currency: 'USD',
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceYearly: 0,
    ringBg: 'rgba(156, 163, 175, 0.1)',
    tagline: 'Ideal para proyectos personales y funciones básicas',
  },
  pro: {
    borderColor: '#3b82f6',
    currency: 'USD',
    id: 'pro',
    name: 'Pro',
    priceMonthly: 9.99,
    priceYearly: 95.9,
    ringBg: 'rgba(59, 130, 246, 0.15)',
    tagline: 'Para creadores y profesionales exigentes',
  },
  enterprise: {
    borderColor: 'conic-gradient(from 295deg, #8b5cf6 0% 28%, #ec4899 28% 57%, #3b82f6 57% 85%, #6366f1 85% 100%)',
    currency: 'USD',
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 0,
    priceYearly: 0,
    ringBg: 'rgba(99, 102, 241, 0.25)',
    tagline: 'Seguridad corporativa, control de acceso y soporte dedicado',
  },
};

export function normalizeTierKey(tier?: string): SubscriptionTierId {
  const norm = (tier || 'free').toLowerCase();
  if (norm === 'empresas' || norm === 'enterprise') return 'enterprise';
  if (norm === 'pro' || norm === 'plus') return 'pro';
  return 'free';
}

export function getTierBorderColor(tier?: string): string {
  const key = normalizeTierKey(tier);
  return PLAN_TIER_CONFIGS[key]?.borderColor || PLAN_TIER_CONFIGS.free.borderColor;
}

export function getTierName(tier?: string): string {
  const key = normalizeTierKey(tier);
  return PLAN_TIER_CONFIGS[key]?.name || PLAN_TIER_CONFIGS.free.name;
}
