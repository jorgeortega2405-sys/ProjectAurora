import { createAdminBackup, deleteAdminBackup, downloadAdminBackup, getAdminBackupStatus, getAdminBackups, getAdminHealth, getAdminInquiries, getAdminOrganizations, getAdminPurchases, getAdminUsers, getAdminVerifications, restoreAdminBackup, reviewAdminVerification, updateAdminInquiryStatus, updateAdminOrganization } from '../controllers/admin.controller.js';
import { Router } from 'express';

const router = Router();

router.get('/health', getAdminHealth);
router.get('/users', getAdminUsers);
router.get('/purchases', getAdminPurchases);
router.get('/education/verifications', getAdminVerifications);
router.post('/education/verifications/:id/review', reviewAdminVerification);
router.get('/organizations', getAdminOrganizations);
router.patch('/organizations/:id', updateAdminOrganization);
router.get('/inquiries', getAdminInquiries);
router.patch('/inquiries/:id', updateAdminInquiryStatus);
router.get('/backups', getAdminBackups);
router.get('/backups/status', getAdminBackupStatus);
router.post('/backups', createAdminBackup);
router.get('/backups/:id/download', downloadAdminBackup);
router.post('/backups/:id/restore', restoreAdminBackup);
router.delete('/backups/:id', deleteAdminBackup);

export default router;
