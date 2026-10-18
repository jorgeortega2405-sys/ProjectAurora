export type SubscriptionTierId = 'free' | 'pro' | 'enterprise';

export type BillingInterval = 'monthly' | 'yearly';

export interface PurchaseRecord {
  amount_total: number;
  billing_period: BillingInterval;
  created_at: string;
  currency: string;
  id: number;
  plan_id: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string;
  stripe_subscription_id: string | null;
  updated_at: string;
  user_id: string;
}

export interface UserBillingInfo {
  cancel_at_period_end: boolean;
  plan_name: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_period_end: string | null;
  subscription_status: string;
  subscription_tier: string;
  subscription_tier_color: string;
}
