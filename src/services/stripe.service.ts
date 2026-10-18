import { config } from '../config/env.config.js';
import { PLAN_TIER_CONFIGS, normalizeTierKey } from '../config/plans.config.js';
import { redis } from '../config/redis.config.js';
import { BillingInterval } from '../types/subscription.types.js';
import { logger } from './logger.service.js';
import { getPurchaseBySessionId, getUserByStripeCustomerId, getUserBillingInfo, recordPurchase, updateUserCustomerId, updateUserSubscription } from './purchase.service.js';
import Stripe from 'stripe';

export class StripeService {
  private static instance: StripeService;
  private stripe: Stripe;

  private constructor() {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2025-02-24.acacia' as any,
    });
  }

  public static getInstance(): StripeService {
    if (!StripeService.instance) {
      StripeService.instance = new StripeService();
    }
    return StripeService.instance;
  }

  public async createCheckoutSession(
    userId: string,
    email: string,
    planId: string,
    billingPeriod: BillingInterval,
    baseUrl: string
  ): Promise<{ id: string; url: string }> {
    const normalizedPlan = normalizeTierKey(planId);
    const tier = PLAN_TIER_CONFIGS[normalizedPlan];

    if (!tier || normalizedPlan !== 'pro') {
      throw new Error(`Plan "${planId}" no disponible para compra directa.`);
    }

    const isYearly = billingPeriod === 'yearly';
    const unitPrice = isYearly ? tier.priceYearly : tier.priceMonthly;
    const amountInCents = Math.round(unitPrice * 100);

    const customer = await this.getOrCreateCustomer(userId, email);
    const userBilling = await getUserBillingInfo(userId);
    const previousSubscriptionId = userBilling?.stripe_subscription_id || null;

    const session = await this.stripe.checkout.sessions.create({
      cancel_url: `${baseUrl}/upgrade?payment=cancelled`,
      client_reference_id: userId,
      customer: customer.id,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              description: tier.tagline,
              name: `ProjectAurora ${tier.name}`,
            },
            recurring: {
              interval: isYearly ? 'year' : 'month',
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        billingPeriod,
        planId: tier.id,
        previousSubscriptionId: previousSubscriptionId || '',
        userId,
      },
      mode: 'subscription',
      subscription_data: {

        metadata: {
          billingPeriod,
          planId: tier.id,
          previousSubscriptionId: previousSubscriptionId || '',
          userId,
        },
      },
      success_url: `${baseUrl}/upgrade?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    });

    if (!session.url) {
      throw new Error('No se pudo generar la URL de Stripe Checkout.');
    }

    await recordPurchase({
      amountTotal: unitPrice,
      billingPeriod,
      currency: 'USD',
      planId: tier.id,
      status: 'pending',
      stripeCustomerId: customer.id,
      stripeSessionId: session.id,
      userId,
    });

    logger.app.info('Sesión de Stripe Checkout creada', {
      period: billingPeriod,
      plan: tier.id,
      sessionId: session.id,
      userId,
    });

    return { id: session.id, url: session.url };
  }

  public constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.stripe.webhookSecret
    );
  }

  public async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    const eventKey = `webhook:stripe:processed:${event.id}`;
    let isNew = false;
    try {
      isNew = Boolean(await redis.set(eventKey, '1', 'EX', 86400, 'NX'));
    } catch {
      isNew = true;
    }

    if (!isNew) {
      logger.app.info('Evento de Stripe Webhook duplicado omitido', { id: event.id, type: event.type });
      return;
    }

    logger.app.info('Procesando evento de Stripe Webhook', { id: event.id, type: event.type });

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.processSuccessfulCheckout(session);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.processSubscriptionUpdated(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.processSubscriptionDeleted(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await this.processInvoicePaymentSucceeded(invoice);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await this.processInvoicePaymentFailed(invoice);
        break;
      }
      default:
        logger.app.info(`Evento de Stripe no manejado: ${event.type}`);
    }
  }

  private async processSuccessfulCheckout(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId || session.client_reference_id;
    const planId = session.metadata?.planId || 'pro';
    const billingPeriod = (session.metadata?.billingPeriod as BillingInterval) || 'monthly';
    const amountTotal = (session.amount_total ?? 0) / 100;
    const currency = session.currency || 'USD';
    const customerId = typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : (session.subscription?.id ?? null);
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null);
    const previousSubId = session.metadata?.previousSubscriptionId;

    if (!userId) {
      logger.app.warn('Webhook checkout.session.completed sin userId válido', { sessionId: session.id });
      return;
    }

    const lockKey = `lock:checkout_sync:${session.id}`;
    let acquired = false;
    try {
      acquired = Boolean(await redis.set(lockKey, 'locked', 'EX', 60, 'NX'));
    } catch {
      acquired = true;
    }

    if (!acquired) {
      logger.app.info('Checkout session ya procesándose o procesada', { sessionId: session.id });
      return;
    }

    const existing = await getPurchaseBySessionId(session.id);
    if (existing && existing.status === 'completed') {
      return;
    }

    if (previousSubId && subscriptionId && previousSubId !== subscriptionId) {
      try {
        await this.stripe.subscriptions.cancel(previousSubId);
        logger.app.info('Suscripción anterior cancelada tras nuevo checkout', { previousSubId, userId });
      } catch (prevErr) {
        logger.app.warn('Aviso al cancelar suscripción anterior en Stripe', { prevErr, previousSubId, userId });
      }
    }

    await recordPurchase({
      amountTotal,
      billingPeriod,
      currency,
      planId,
      status: 'completed',
      stripeCustomerId: customerId,
      stripePaymentIntentId: paymentIntentId,
      stripeSessionId: session.id,
      stripeSubscriptionId: subscriptionId,
      userId,
    });

    await updateUserSubscription(userId, {
      cancelAtPeriodEnd: false,
      status: 'active',
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      tier: planId,
    });

    logger.app.info('Checkout procesado y cuenta mejorada con éxito', {
      planId,
      sessionId: session.id,
      userId,
    });
  }

  private async processInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const inv = invoice as any;
    const customerId = typeof inv.customer === 'string' ? inv.customer : (inv.customer?.id ?? null);
    const subscriptionId = typeof inv.subscription === 'string' ? inv.subscription : (inv.subscription?.id ?? null);

    if (!customerId) return;
    const user = await getUserByStripeCustomerId(customerId);
    if (!user) return;

    const existing = await getPurchaseBySessionId(`inv_${invoice.id}`);
    if (existing) return;

    const amountTotal = (invoice.amount_paid ?? 0) / 100;
    const currency = invoice.currency || 'USD';
    const lineItem = inv.lines?.data?.[0];
    const billingPeriod: BillingInterval = lineItem?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
    let planId = inv.subscription_details?.metadata?.planId || lineItem?.price?.metadata?.planId;
    if (!planId && subscriptionId) {
      try {
        const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
        planId = sub.metadata?.planId;
      } catch {}
    }
    if (!planId) {
      planId = user.subscription_tier || 'pro';
    }

    await recordPurchase({
      amountTotal,
      billingPeriod,
      currency,
      planId,
      status: 'completed',
      stripeCustomerId: customerId,
      stripePaymentIntentId: typeof inv.payment_intent === 'string' ? inv.payment_intent : null,
      stripeSessionId: `inv_${invoice.id}`,
      stripeSubscriptionId: subscriptionId,
      userId: user.id,
    });


    let periodEnd: Date | null = null;
    if (subscriptionId) {
      try {
        const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
        if ((sub as any).current_period_end) {
          periodEnd = new Date((sub as any).current_period_end * 1000);
        }
      } catch {}
    }

    await updateUserSubscription(user.id, {
      cancelAtPeriodEnd: false,
      periodEnd,
      status: 'active',
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      tier: planId,
    });

    logger.app.info('Factura periódica pagada con éxito y registrada', {
      amount: amountTotal,
      invoiceId: invoice.id,
      userId: user.id,
    });
  }

  private async processInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer?.id ?? null);
    if (!customerId) return;
    const user = await getUserByStripeCustomerId(customerId);
    if (!user) return;

    logger.security.warn('Fallo en cobro periódico de factura en Stripe', {
      customerId,
      invoiceId: invoice.id,
      userId: user.id,
    });
  }

  private async processSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    if (!customerId) return;

    const user = await getUserByStripeCustomerId(customerId);
    if (!user) return;

    const status = subscription.status;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;
    const periodEnd = (subscription as any).current_period_end
      ? new Date((subscription as any).current_period_end * 1000)
      : null;
    const planId = subscription.metadata?.planId || user.subscription_tier || 'pro';
    const tier = (status === 'active' || status === 'trialing') ? planId : 'free';

    await updateUserSubscription(user.id, {
      cancelAtPeriodEnd,
      periodEnd,
      status,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      tier,
    });

    logger.app.info('Estado de suscripción actualizado vía Webhook', {
      cancelAtPeriodEnd,
      status,
      tier,
      userId: user.id,
    });
  }

  private async processSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    if (!customerId) return;

    const user = await getUserByStripeCustomerId(customerId);
    if (!user) return;

    await updateUserSubscription(user.id, {
      cancelAtPeriodEnd: false,
      periodEnd: null,
      status: 'canceled',
      stripeCustomerId: customerId,
      stripeSubscriptionId: null,
      tier: 'free',
    });

    logger.app.info('Suscripción cancelada definitivamente en Stripe', {
      userId: user.id,
    });
  }

  public async verifyAndSyncCheckoutSession(
    sessionId: string,
    userId: string
  ): Promise<{ purchase: any; success: boolean; tier: string }> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'payment_intent'],
    });

    const sessionUserId = session.metadata?.userId || session.client_reference_id;
    if (sessionUserId !== userId) {
      throw new Error('La sesión de pago no coincide con el usuario autenticado.');
    }

    if (session.status !== 'complete' || session.payment_status !== 'paid') {
      throw new Error('El pago aún no ha sido completado por Stripe.');
    }

    const planId = session.metadata?.planId || 'pro';
    const billingPeriod = (session.metadata?.billingPeriod as BillingInterval) || 'monthly';
    const amountTotal = (session.amount_total ?? 0) / 100;
    const customerId = typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : (session.subscription?.id ?? null);
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null);
    const previousSubId = session.metadata?.previousSubscriptionId;

    const lockKey = `lock:checkout_sync:${session.id}`;
    let acquired = false;
    try {
      acquired = Boolean(await redis.set(lockKey, 'locked', 'EX', 60, 'NX'));
    } catch {
      acquired = true;
    }

    if (!acquired) {
      await new Promise((r) => setTimeout(r, 500));
      const existing = await getPurchaseBySessionId(session.id);
      return {
        purchase: {
          amountTotal: existing?.amount_total || amountTotal,
          billingPeriod: existing?.billing_period || billingPeriod,
          planId: existing?.plan_id || planId,
        },
        success: true,
        tier: existing?.plan_id || planId,
      };
    }

    try {
      const existing = await getPurchaseBySessionId(session.id);
      if (existing && existing.status === 'completed') {
        return {
          purchase: {
            amountTotal: existing.amount_total || amountTotal,
            billingPeriod: existing.billing_period || billingPeriod,
            planId: existing.plan_id || planId,
          },
          success: true,
          tier: existing.plan_id || planId,
        };
      }

      if (previousSubId && subscriptionId && previousSubId !== subscriptionId) {
        try {
          await this.stripe.subscriptions.cancel(previousSubId);
          logger.app.info('Suscripción anterior cancelada tras retorno de checkout', { previousSubId, userId });
        } catch (prevErr) {
          logger.app.warn('Aviso al cancelar suscripción anterior tras checkout', { prevErr, previousSubId, userId });
        }
      }

      await recordPurchase({
        amountTotal,
        billingPeriod,
        currency: session.currency || 'USD',
        planId,
        status: 'completed',
        stripeCustomerId: customerId,
        stripePaymentIntentId: paymentIntentId,
        stripeSessionId: session.id,
        stripeSubscriptionId: subscriptionId,
        userId,
      });

      let periodEnd: Date | null = null;
      if (subscriptionId) {
        try {
          const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
          if ((sub as any).current_period_end) {
            periodEnd = new Date((sub as any).current_period_end * 1000);
          }
        } catch {}
      }

      await updateUserSubscription(userId, {
        cancelAtPeriodEnd: false,
        periodEnd,
        status: 'active',
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        tier: planId,
      });

      return {
        purchase: {
          amountTotal,
          billingPeriod,
          planId,
        },
        success: true,
        tier: planId,
      };
    } finally {
      try {
        await redis.del(lockKey);
      } catch {}
    }
  }

  public async getOrCreateCustomer(
    userId: string,
    email: string,
    username?: string
  ): Promise<Stripe.Customer> {
    const userBilling = await getUserBillingInfo(userId);
    if (userBilling?.stripe_customer_id) {
      try {
        const existingCustomer = await this.stripe.customers.retrieve(userBilling.stripe_customer_id);
        if (!existingCustomer.deleted) {
          return existingCustomer as Stripe.Customer;
        }
      } catch {}
    }

    const customer = await this.stripe.customers.create({
      email,
      metadata: {
        userId,
      },
      name: username || undefined,
    });

    await updateUserCustomerId(userId, customer.id);
    return customer;
  }

  public async getSubscriptionDetails(userId: string): Promise<{
    amount: number;
    cancel_at_period_end: boolean;
    currency: string;
    current_period_end: string | null;
    hasSubscription: boolean;
    interval: 'month' | 'year';
    status: string;
    subscription_id: string | null;
    tier: string;
  }> {
    const user = await getUserBillingInfo(userId);
    if (!user) {
      throw new Error('Usuario no encontrado.');
    }

    const defaultResult = {
      amount: 0,
      cancel_at_period_end: user.cancel_at_period_end || false,
      currency: 'USD',
      current_period_end: user.subscription_period_end,
      hasSubscription: false,
      interval: 'month' as const,
      status: user.subscription_status || 'none',
      subscription_id: user.stripe_subscription_id,
      tier: user.subscription_tier || 'free',
    };

    if (!user.stripe_subscription_id) {
      return defaultResult;
    }

    try {
      const sub = await this.stripe.subscriptions.retrieve(user.stripe_subscription_id);
      const item = sub.items?.data?.[0];
      const price = item?.price;

      return {
        amount: price?.unit_amount ? price.unit_amount / 100 : 0,
        cancel_at_period_end: sub.cancel_at_period_end,
        currency: (price?.currency || 'USD').toUpperCase(),
        current_period_end: (sub as any).current_period_end ? new Date((sub as any).current_period_end * 1000).toISOString() : user.subscription_period_end,
        hasSubscription: sub.status === 'active' || sub.status === 'trialing',
        interval: (price?.recurring?.interval as 'month' | 'year') || 'month',
        status: sub.status,
        subscription_id: sub.id,
        tier: user.subscription_tier,
      };
    } catch (error) {
      logger.app.warn('No se pudo recuperar suscripción desde Stripe API', { error, userId });
      return defaultResult;
    }
  }

  public async updateSubscriptionRenewal(
    userId: string,
    cancelAtPeriodEnd: boolean
  ): Promise<{ cancel_at_period_end: boolean; current_period_end: string | null; success: boolean }> {
    const user = await getUserBillingInfo(userId);
    if (!user || !user.stripe_subscription_id) {
      throw new Error('No tienes una suscripción activa para modificar.');
    }

    const sub = await this.stripe.subscriptions.update(user.stripe_subscription_id, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });

    await updateUserSubscription(userId, {
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      tier: user.subscription_tier,
    });

    logger.app.info('Estado de renovación automática actualizado', {
      cancelAtPeriodEnd,
      subscriptionId: sub.id,
      userId,
    });

    return {
      cancel_at_period_end: sub.cancel_at_period_end,
      current_period_end: (sub as any).current_period_end ? new Date((sub as any).current_period_end * 1000).toISOString() : null,
      success: true,
    };
  }

  public async cancelSubscriptionNow(userId: string): Promise<{ success: boolean; tier: string }> {
    const user = await getUserBillingInfo(userId);
    if (!user) {
      throw new Error('Usuario no encontrado.');
    }

    if (user.stripe_subscription_id) {
      try {
        await this.stripe.subscriptions.cancel(user.stripe_subscription_id);
      } catch (err) {
        logger.app.warn('Aviso al cancelar suscripción en Stripe', { err, userId });
      }
    }

    await updateUserSubscription(userId, {
      cancelAtPeriodEnd: false,
      periodEnd: null,
      status: 'canceled',
      stripeCustomerId: user.stripe_customer_id,
      stripeSubscriptionId: null,
      tier: 'free',
    });

    logger.app.info('Suscripción cancelada inmediatamente', { userId });

    return {
      success: true,
      tier: 'free',
    };
  }
}

export const stripeService = StripeService.getInstance();
