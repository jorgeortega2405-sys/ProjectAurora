import { createAdminBackup, deleteAdminBackup, downloadAdminBackup, getAdminBackupStatus, getAdminBackups, getAdminHealth, getAdminInquiries, getAdminOrganizations, getAdminPurchases, getAdminUsers, getAdminVerifications, restoreAdminBackup, reviewAdminVerification, updateAdminInquiryStatus, updateAdminOrganization } from '../controllers/admin.controller.js';
import { getMe, loginAdmin, logoutAdmin, logoutAllAdminController, switchAdminAccountController } from '../controllers/auth.controller.js';
import { requireAdminAuth, requireAdminPermission } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.post('/auth/login', loginAdmin);
router.get('/auth/me', requireAdminAuth, getMe);
router.post('/auth/switch-account', requireAdminAuth, switchAdminAccountController);
router.post('/auth/logout', requireAdminAuth, logoutAdmin);
router.post('/auth/logout-all', requireAdminAuth, logoutAllAdminController);

router.get('/health', requireAdminAuth, requireAdminPermission('admin:access'), getAdminHealth);
router.get('/users', requireAdminAuth, requireAdminPermission('admin:users:view'), getAdminUsers);
router.get('/purchases', requireAdminAuth, requireAdminPermission('admin:purchases:view'), getAdminPurchases);
router.get('/education/verifications', requireAdminAuth, requireAdminPermission('admin:education:view'), getAdminVerifications);
router.post('/education/verifications/:id/review', requireAdminAuth, requireAdminPermission('admin:education:review'), reviewAdminVerification);
router.get('/organizations', requireAdminAuth, requireAdminPermission('admin:organizations:view'), getAdminOrganizations);
router.patch('/organizations/:id', requireAdminAuth, requireAdminPermission('admin:organizations:manage'), updateAdminOrganization);
router.get('/inquiries', requireAdminAuth, requireAdminPermission('admin:inquiries:view'), getAdminInquiries);
router.patch('/inquiries/:id', requireAdminAuth, requireAdminPermission('admin:inquiries:manage'), updateAdminInquiryStatus);
router.get('/backups', requireAdminAuth, requireAdminPermission('system:backup:read'), getAdminBackups);
router.get('/backups/status', requireAdminAuth, requireAdminPermission('system:backup:read'), getAdminBackupStatus);
router.post('/backups', requireAdminAuth, requireAdminPermission('system:backup:create'), createAdminBackup);
router.get('/backups/:id/download', requireAdminAuth, requireAdminPermission('system:backup:read'), downloadAdminBackup);
router.post('/backups/:id/restore', requireAdminAuth, requireAdminPermission('system:backup:restore'), restoreAdminBackup);
router.delete('/backups/:id', requireAdminAuth, requireAdminPermission('system:backup:delete'), deleteAdminBackup);

export default router;
