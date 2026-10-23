import { cancelSubscriptionImmediate, createCheckout, getBillingDetails, getPurchaseHistory, handleWebhook, updateAutoRenewal, verifySession } from '../controllers/subscription.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

export const subscriptionRouter = Router();

subscriptionRouter.post('/webhook', handleWebhook);
subscriptionRouter.post('/checkout', requireAuth, createCheckout);
subscriptionRouter.get('/verify', requireAuth, verifySession);
subscriptionRouter.get('/billing', requireAuth, getBillingDetails);
subscriptionRouter.post('/renewal', requireAuth, updateAutoRenewal);
subscriptionRouter.post('/cancel', requireAuth, cancelSubscriptionImmediate);
subscriptionRouter.get('/purchases', requireAuth, getPurchaseHistory);
