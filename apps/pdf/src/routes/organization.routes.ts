import { addDomainHandler, addMemberHandler, createOrganizationHandler, getMyOrganizationHandler, listMembersHandler, removeDomainHandler, removeMemberHandler } from '../controllers/organization.controller.js';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.post('/organizations', requireAuth, createOrganizationHandler);
router.get('/organizations/me', requireAuth, getMyOrganizationHandler);
router.get('/organizations/me/members', requireAuth, listMembersHandler);
router.post('/organizations/me/members', requireAuth, requirePermission('org:members:invite'), addMemberHandler);
router.delete('/organizations/me/members/:memberId', requireAuth, requirePermission('org:members:remove'), removeMemberHandler);
router.post('/organizations/me/domains', requireAuth, requirePermission('org:manage'), addDomainHandler);
router.delete('/organizations/me/domains/:domainId', requireAuth, requirePermission('org:manage'), removeDomainHandler);

export default router;
