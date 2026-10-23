import { Router } from 'express';
import { getAdminHealth, getAdminOrganizations, getAdminPurchases, getAdminUsers, getAdminVerifications, reviewAdminVerification, updateAdminOrganization } from '../controllers/admin.controller.js';

const router = Router();

router.get('/health', getAdminHealth);
router.get('/users', getAdminUsers);
router.get('/purchases', getAdminPurchases);
router.get('/education/verifications', getAdminVerifications);
router.post('/education/verifications/:id/review', reviewAdminVerification);
router.get('/organizations', getAdminOrganizations);
router.patch('/organizations/:id', updateAdminOrganization);

export default router;
