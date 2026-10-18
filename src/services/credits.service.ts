import { pool } from '../config/database.config.js';
import { logger } from './logger.service.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

interface CreditsRow extends RowDataPacket {
  ai_credits_balance: number;
}

export const AI_CREDIT_COSTS = {
  advancedSummarize: 10,
  advancedTranslate: 10,
  standard: 0,
};

export const SUBSCRIPTION_INITIAL_CREDITS: Record<string, number> = {
  enterprise: 10000,
  free: 0,
  pro: 2000,
};

export async function getUserCredits(userId: string): Promise<number> {
  try {
    const [rows] = await pool.query<CreditsRow[]>(
      'SELECT ai_credits_balance FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!rows || rows.length === 0) return 0;
    return Number(rows[0].ai_credits_balance || 0);
  } catch (error) {
    logger.db.error('Error al consultar saldo de créditos de usuario', { error, userId });
    return 0;
  }
}

export async function deductUserCredits(
  userId: string,
  amount: number,
  taskDescription = 'ai_task'
): Promise<{ remaining: number; success: boolean }> {
  if (amount <= 0) {
    const current = await getUserCredits(userId);
    return { remaining: current, success: true };
  }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      'UPDATE users SET ai_credits_balance = ai_credits_balance - ? WHERE id = ? AND ai_credits_balance >= ?',
      [amount, userId, amount]
    );

    if (result.affectedRows === 0) {
      const remaining = await getUserCredits(userId);
      logger.app.warn('Saldo insuficiente de créditos para tarea de IA', {
        amount,
        remaining,
        taskDescription,
        userId,
      });
      return { remaining, success: false };
    }

    const remaining = await getUserCredits(userId);
    logger.app.info('Créditos consumidos exitosamente', {
      amount,
      remaining,
      taskDescription,
      userId,
    });

    return { remaining, success: true };
  } catch (error) {
    logger.db.error('Error al deducir créditos de IA', { amount, error, userId });
    return { remaining: 0, success: false };
  }
}

export async function grantUserCredits(
  userId: string,
  amount: number
): Promise<number> {
  try {
    await pool.query<ResultSetHeader>(
      'UPDATE users SET ai_credits_balance = ai_credits_balance + ? WHERE id = ?',
      [amount, userId]
    );
    const updated = await getUserCredits(userId);
    logger.app.info('Créditos asignados a usuario', { amount, total: updated, userId });
    return updated;
  } catch (error) {
    logger.db.error('Error al asignar créditos a usuario', { amount, error, userId });
    return 0;
  }
}

export async function syncSubscriptionCredits(
  userId: string,
  tier: string
): Promise<number> {
  const norm = (tier || 'free').toLowerCase();
  const targetCredits = norm === 'enterprise' || norm === 'empresas'
    ? SUBSCRIPTION_INITIAL_CREDITS.enterprise
    : (norm === 'pro' || norm === 'plus' ? SUBSCRIPTION_INITIAL_CREDITS.pro : SUBSCRIPTION_INITIAL_CREDITS.free);

  if (targetCredits <= 0) return 0;

  try {
    await pool.query<ResultSetHeader>(
      'UPDATE users SET ai_credits_balance = GREATEST(ai_credits_balance, ?) WHERE id = ?',
      [targetCredits, userId]
    );
    const current = await getUserCredits(userId);
    logger.app.info('Créditos de suscripción sincronizados', { current, targetCredits, tier, userId });
    return current;
  } catch (error) {
    logger.db.error('Error al sincronizar créditos de suscripción', { error, tier, userId });
    return 0;
  }
}
