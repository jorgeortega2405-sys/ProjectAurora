import { createEnterpriseInquiryHandler } from '../controllers/enterprise.controller.js';
import { Router } from 'express';

const router = Router();

router.post('/enterprise/inquiry', createEnterpriseInquiryHandler);

export default router;
