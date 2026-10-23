import { pool } from '../config/database.config.js';
import { getTierBorderColor, getTierName } from '../config/plans.config.js';
import { BillingInterval, PurchaseRecord, UserBillingInfo } from '../types/subscription.types.js';
import { syncSubscriptionCredits } from './credits.service.js';
import { logger } from './logger.service.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

interface PurchaseRow extends RowDataPacket {
  amount_total: string | number;
  billing_period: BillingInterval;
  created_at: Date | string;
  currency: string;
  id: number;
  plan_id: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string;
  stripe_subscription_id: string | null;
  updated_at: Date | string;
  user_id: string;
}

interface UserBillingRow extends RowDataPacket {
  cancel_at_period_end: number | boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_period_end: Date | string | null;
  subscription_status: string;
  subscription_tier: string;
}

function mapRowToPurchase(row: PurchaseRow): PurchaseRecord {
  return {
    amount_total: Number(row.amount_total),
    billing_period: row.billing_period,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    currency: row.currency,
    id: row.id,
    plan_id: row.plan_id,
    status: row.status,
    stripe_customer_id: row.stripe_customer_id ?? null,
    stripe_payment_intent_id: row.stripe_payment_intent_id ?? null,
    stripe_session_id: row.stripe_session_id,
    stripe_subscription_id: row.stripe_subscription_id ?? null,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    user_id: row.user_id,
  };
}

export async function recordPurchase(params: {
  amountTotal: number;
  billingPeriod: BillingInterval;
  currency: string;
  planId: string;
  status: string;
  stripeCustomerId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeSessionId: string;
  stripeSubscriptionId?: string | null;
  userId: string;
}): Promise<void> {
  try {
    await pool.query<ResultSetHeader>(
      `INSERT INTO purchases (
        user_id, stripe_session_id, stripe_payment_intent_id, stripe_subscription_id,
        stripe_customer_id, plan_id, billing_period, amount_total, currency, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        stripe_payment_intent_id = VALUES(stripe_payment_intent_id),
        stripe_subscription_id = VALUES(stripe_subscription_id),
        stripe_customer_id = VALUES(stripe_customer_id),
        status = VALUES(status),
        updated_at = CURRENT_TIMESTAMP`,
      [
        params.userId,
        params.stripeSessionId,
        params.stripePaymentIntentId ?? null,
        params.stripeSubscriptionId ?? null,
        params.stripeCustomerId ?? null,
        params.planId,
        params.billingPeriod,
        params.amountTotal,
        params.currency.toUpperCase(),
        params.status,
      ]
    );
  } catch (error) {
    logger.db.error('Error al registrar compra en base de datos', { error, userId: params.userId });
    throw error;
  }
}

export async function updateUserSubscription(
  userId: string,
  params: {
    cancelAtPeriodEnd?: boolean;
    periodEnd?: Date | string | null;
    status?: string;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    tier: string;
  }
): Promise<void> {
  try {
    const fields: string[] = ['subscription_tier = ?'];
    const values: (string | number | boolean | Date | null)[] = [params.tier];

    if (params.tier && params.tier !== 'free') {
      fields.push('is_student = FALSE');
      fields.push("subscription_origin = 'stripe'");
    }

    if (params.stripeCustomerId !== undefined) {
      fields.push('stripe_customer_id = ?');
      values.push(params.stripeCustomerId);
    }
    if (params.stripeSubscriptionId !== undefined) {
      fields.push('stripe_subscription_id = ?');
      values.push(params.stripeSubscriptionId);
    }
    if (params.status !== undefined) {
      fields.push('subscription_status = ?');
      values.push(params.status);
    }
    if (params.periodEnd !== undefined) {
      fields.push('subscription_period_end = ?');
      values.push(params.periodEnd);
    }
    if (params.cancelAtPeriodEnd !== undefined) {
      fields.push('cancel_at_period_end = ?');
      values.push(params.cancelAtPeriodEnd ? 1 : 0);
    }

    values.push(userId);

    await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    await syncSubscriptionCredits(userId, params.tier);
  } catch (error) {
    logger.db.error('Error al actualizar suscripcion de usuario', { error, userId });
    throw error;
  }
}

export async function getPurchasesByUserId(userId: string): Promise<PurchaseRecord[]> {
  try {
    const [rows] = await pool.query<PurchaseRow[]>(
      'SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(mapRowToPurchase);
  } catch (error) {
    logger.db.error('Error al consultar historial de compras', { error, userId });
    return [];
  }
}

export async function getPurchaseBySessionId(sessionId: string): Promise<PurchaseRecord | null> {
  try {
    const [rows] = await pool.query<PurchaseRow[]>(
      'SELECT * FROM purchases WHERE stripe_session_id = ? LIMIT 1',
      [sessionId]
    );
    if (rows.length === 0) return null;
    return mapRowToPurchase(rows[0]);
  } catch (error) {
    logger.db.error('Error al consultar compra por session ID', { error, sessionId });
    return null;
  }
}

export async function getUserBillingInfo(userId: string): Promise<UserBillingInfo | null> {
  try {
    const [rows] = await pool.query<UserBillingRow[]>(
      'SELECT subscription_tier, subscription_status, subscription_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    const tier = row.subscription_tier || 'free';
    return {
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      plan_name: getTierName(tier),
      stripe_customer_id: row.stripe_customer_id ?? null,
      stripe_subscription_id: row.stripe_subscription_id ?? null,
      subscription_period_end: row.subscription_period_end ? (row.subscription_period_end instanceof Date ? row.subscription_period_end.toISOString() : String(row.subscription_period_end)) : null,
      subscription_status: row.subscription_status || 'active',
      subscription_tier: tier,
      subscription_tier_color: getTierBorderColor(tier),
    };
  } catch (error) {
    logger.db.error('Error al consultar informacion de facturacion', { error, userId });
    return null;
  }
}

export async function getUserByStripeCustomerId(customerId: string): Promise<UserBillingRow | null> {
  try {
    const [rows] = await pool.query<UserBillingRow[]>(
      'SELECT id, subscription_tier, subscription_status, subscription_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id FROM users WHERE stripe_customer_id = ? LIMIT 1',
      [customerId]
    );
    if (rows.length === 0) return null;
    return rows[0];
  } catch (error) {
    logger.db.error('Error al consultar usuario por Stripe customer ID', { error, customerId });
    return null;
  }
}

export async function updateUserCustomerId(userId: string, customerId: string): Promise<void> {
  try {
    await pool.query('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customerId, userId]);
  } catch (error) {
    logger.db.error('Error al actualizar Stripe customer ID', { error, userId, customerId });
    throw error;
  }
}

