import { Router } from 'express';
import { handleCreateContactTicket, handleGetPublicTicketStatus, handleInboundEmailWebhook, handlePublicTicketReply, handleSupportChat } from '../controllers/support.controller.js';

const router = Router();

router.post('/support/chat', handleSupportChat);
router.post('/support/contact', handleCreateContactTicket);
router.get('/support/tickets/:token', handleGetPublicTicketStatus);
router.post('/support/tickets/:token/reply', handlePublicTicketReply);
router.post('/support/inbound-webhook', handleInboundEmailWebhook);

export default router;
