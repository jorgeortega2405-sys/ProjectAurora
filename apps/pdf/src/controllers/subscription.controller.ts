import { config } from '../config/env.config.js';
import { getSessionUser } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';
import { getPurchasesByUserId } from '../services/purchase.service.js';
import { stripeService } from '../services/stripe.service.js';
import { BillingInterval } from '../types/subscription.types.js';
import { Request, Response } from 'express';

export async function createCheckout(req: Request, res: Response): Promise<void> {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ message: 'Debes iniciar sesión para continuar.', success: false });
      return;
    }

    const { billingPeriod, planId } = req.body;
    if (!planId || !['pro'].includes(planId)) {
      res.status(400).json({ message: 'El plan seleccionado no es válido.', success: false });
      return;
    }

    const period: BillingInterval = billingPeriod === 'yearly' ? 'yearly' : 'monthly';
    const baseUrl = config.baseUrl;

    const session = await stripeService.createCheckoutSession(
      user.id,
      user.email,
      planId,
      period,
      baseUrl
    );

    res.json({ id: session.id, success: true, url: session.url });
  } catch (error) {
    logger.app.error('Error al iniciar checkout de suscripción', { error });
    res.status(500).json({ message: 'No se pudo iniciar el proceso de pago. Intenta más tarde.', success: false });
  }
}

export async function verifySession(req: Request, res: Response): Promise<void> {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ message: 'No autorizado.', success: false });
      return;
    }

    const { session_id } = req.query;
    if (!session_id || typeof session_id !== 'string') {
      res.status(400).json({ message: 'ID de sesión requerido.', success: false });
      return;
    }

    const result = await stripeService.verifyAndSyncCheckoutSession(session_id, user.id);
    res.json(result);
  } catch (error) {
    logger.app.error('Error al verificar sesión de Stripe', { error });
    res.status(500).json({ message: 'No se pudo verificar el estado del pago.', success: false });
  }
}

export async function getBillingDetails(req: Request, res: Response): Promise<void> {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ message: 'No autorizado.', success: false });
      return;
    }

    const billing = await stripeService.getSubscriptionDetails(user.id);
    res.json({ billing, success: true });
  } catch (error) {
    logger.app.error('Error al obtener datos de facturación', { error });
    res.status(500).json({ message: 'No se pudieron cargar los datos de facturación.', success: false });
  }
}

export async function updateAutoRenewal(req: Request, res: Response): Promise<void> {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ message: 'No autorizado.', success: false });
      return;
    }

    const { cancelAtPeriodEnd } = req.body;
    if (typeof cancelAtPeriodEnd !== 'boolean') {
      res.status(400).json({ message: 'Parámetro inválido.', success: false });
      return;
    }

    const result = await stripeService.updateSubscriptionRenewal(user.id, cancelAtPeriodEnd);
    res.json(result);
  } catch (error) {
    logger.app.error('Error al actualizar renovación automática', { error });
    res.status(500).json({ message: 'No se pudo actualizar la renovación automática.', success: false });
  }
}

export async function cancelSubscriptionImmediate(req: Request, res: Response): Promise<void> {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ message: 'No autorizado.', success: false });
      return;
    }

    const result = await stripeService.cancelSubscriptionNow(user.id);
    res.json(result);
  } catch (error) {
    logger.app.error('Error al cancelar suscripción', { error });
    res.status(500).json({ message: 'No se pudo cancelar la suscripción. Intenta más tarde.', success: false });
  }
}

export async function getPurchaseHistory(req: Request, res: Response): Promise<void> {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ message: 'No autorizado.', success: false });
      return;
    }

    const purchases = await getPurchasesByUserId(user.id);
    res.json({ purchases, success: true });
  } catch (error) {
    logger.app.error('Error al obtener historial de compras', { error });
    res.status(500).json({ message: 'No se pudo cargar el historial de compras.', success: false });
  }
}

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'];
  if (!sig || typeof sig !== 'string') {
    res.status(400).send('Webhook signature missing');
    return;
  }

  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    res.status(400).send('Webhook payload missing');
    return;
  }

  try {
    const event = stripeService.constructWebhookEvent(rawBody, sig);
    await stripeService.handleWebhookEvent(event);
    res.json({ received: true });
  } catch (error) {
    logger.security.warn('Firma de Stripe Webhook inválida o error en procesamiento', { error });
    res.status(400).send('Webhook Error');
  }
}
