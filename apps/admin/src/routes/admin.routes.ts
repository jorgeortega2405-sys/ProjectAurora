import { createAdminBackup, deleteAdminBackup, downloadAdminBackup, getAdminAccessibleWebsitesController, getAdminBackupStatus, getAdminBackups, getAdminDashboardStats, getAdminHealth, getAdminInquiries, getAdminOrganizations, getAdminPurchases, getAdminUsers, getAdminVerifications, restoreAdminBackup, reviewAdminVerification, updateAdminInquiryStatus, updateAdminOrganization } from '../controllers/admin.controller.js';
import { getMe, loginAdmin, logoutAdmin, logoutAllAdminController, switchAdminAccountController } from '../controllers/auth.controller.js';
import { deleteDocument, deleteEmployee, getEmployee, getHrOverview, getOrganigram, listDepartments, listDocuments, listEmployees, listVacationRequests, patchEmployee, patchVacationRequest, postHireEmployee, postUploadDocument, postVacationRequest } from '../controllers/hr.controller.js';
import { addInternalTicketCommentController, createInternalTicketController, getInternalTicketByIdController, getInternalTicketOptionsController, getInternalTicketsController, getInternalTicketStatsController, updateInternalTicketController } from '../controllers/internal-tickets.controller.js';
import { claimLiveChatController, closeLiveChatController, getLiveChatByIdController, getLiveChatMessagesController, listLiveChatsController, sendAgentMessageController, transferLiveChatController } from '../controllers/support.controller.js';
import { requireAdminAuth, requireAdminPermission, requireAdminWebsiteAccess } from '../middlewares/auth.middleware.js';
import { requireAdminTurnstile } from '../middlewares/turnstile.middleware.js';
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';

const router = Router();

const storage = multer.memoryStorage();
const hrUpload = multer({
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato no soportado. Sube un documento PDF, Word o imagen.'));
    }
  },
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
  storage,
});

function hrUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  hrUpload.single('file')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'El archivo supera el límite permitido de 15 MB.', success: false });
        return;
      }
      res.status(400).json({ error: 'Error al procesar el archivo adjunto.', success: false });
      return;
    } else if (err) {
      res.status(400).json({ error: 'El archivo seleccionado no es válido.', success: false });
      return;
    }
    next();
  });
}

router.post('/auth/login', requireAdminTurnstile(), loginAdmin);
router.get('/auth/me', requireAdminAuth, getMe);
router.post('/auth/switch-account', requireAdminAuth, switchAdminAccountController);
router.post('/auth/logout', requireAdminAuth, logoutAdmin);
router.post('/auth/logout-all', requireAdminAuth, logoutAllAdminController);

router.get('/health', requireAdminAuth, requireAdminPermission('admin:access'), getAdminHealth);
router.get('/dashboard', requireAdminAuth, requireAdminPermission('admin:dashboard:view'), getAdminDashboardStats);
router.get('/dashboard/stats', requireAdminAuth, requireAdminPermission('admin:dashboard:view'), getAdminDashboardStats);
router.get('/websites/accessible', requireAdminAuth, getAdminAccessibleWebsitesController);
router.get('/users', requireAdminAuth, requireAdminPermission('admin:users:view'), getAdminUsers);
router.get('/purchases', requireAdminAuth, requireAdminPermission('admin:purchases:view'), requireAdminWebsiteAccess(), getAdminPurchases);
router.get('/education/verifications', requireAdminAuth, requireAdminPermission('admin:education:view'), getAdminVerifications);
router.post('/education/verifications/:id/review', requireAdminAuth, requireAdminPermission('admin:education:review'), reviewAdminVerification);
router.get('/organizations', requireAdminAuth, requireAdminPermission('admin:organizations:view'), getAdminOrganizations);
router.patch('/organizations/:id', requireAdminAuth, requireAdminPermission('admin:organizations:manage'), updateAdminOrganization);
router.get('/inquiries', requireAdminAuth, requireAdminPermission('admin:inquiries:view'), requireAdminWebsiteAccess(), getAdminInquiries);
router.patch('/inquiries/:id', requireAdminAuth, requireAdminPermission('admin:inquiries:manage'), updateAdminInquiryStatus);
router.get('/backups', requireAdminAuth, requireAdminPermission('system:backup:read'), getAdminBackups);
router.get('/backups/status', requireAdminAuth, requireAdminPermission('system:backup:read'), getAdminBackupStatus);
router.post('/backups', requireAdminAuth, requireAdminPermission('system:backup:create'), createAdminBackup);
router.get('/backups/:id/download', requireAdminAuth, requireAdminPermission('system:backup:read'), downloadAdminBackup);
router.post('/backups/:id/restore', requireAdminAuth, requireAdminPermission('system:backup:restore'), restoreAdminBackup);
router.delete('/backups/:id', requireAdminAuth, requireAdminPermission('system:backup:delete'), deleteAdminBackup);

router.get('/hr/overview', requireAdminAuth, requireAdminPermission('admin:hr:view'), getHrOverview);
router.get('/hr/departments', requireAdminAuth, requireAdminPermission('admin:hr:view'), listDepartments);
router.get('/hr/employees', requireAdminAuth, requireAdminPermission('admin:hr:view'), listEmployees);
router.get('/hr/employees/:id', requireAdminAuth, requireAdminPermission('admin:hr:view'), getEmployee);
router.post('/hr/employees', requireAdminAuth, requireAdminPermission('admin:hr:manage'), postHireEmployee);
router.patch('/hr/employees/:id', requireAdminAuth, requireAdminPermission('admin:hr:manage'), patchEmployee);
router.delete('/hr/employees/:id', requireAdminAuth, requireAdminPermission('admin:hr:manage'), deleteEmployee);
router.get('/hr/organigram', requireAdminAuth, requireAdminPermission('admin:hr:view'), getOrganigram);
router.get('/hr/documents', requireAdminAuth, requireAdminPermission('admin:hr:view'), listDocuments);
router.post('/hr/documents', requireAdminAuth, requireAdminPermission('admin:hr:documents'), hrUploadMiddleware, postUploadDocument);
router.delete('/hr/documents/:id', requireAdminAuth, requireAdminPermission('admin:hr:documents'), deleteDocument);
router.get('/hr/vacations', requireAdminAuth, requireAdminPermission('admin:hr:view'), listVacationRequests);
router.post('/hr/vacations', requireAdminAuth, requireAdminPermission('admin:hr:manage'), postVacationRequest);
router.patch('/hr/vacations/:id', requireAdminAuth, requireAdminPermission('admin:hr:manage'), patchVacationRequest);

router.get('/internal-tickets', requireAdminAuth, requireAdminPermission('admin:tickets:view'), getInternalTicketsController);
router.get('/internal-tickets/stats', requireAdminAuth, requireAdminPermission('admin:tickets:view'), getInternalTicketStatsController);
router.get('/internal-tickets/options', requireAdminAuth, requireAdminPermission(['admin:tickets:view', 'admin:tickets:create']), getInternalTicketOptionsController);
router.get('/internal-tickets/:id', requireAdminAuth, requireAdminPermission('admin:tickets:view'), getInternalTicketByIdController);
router.post('/internal-tickets', requireAdminAuth, requireAdminPermission('admin:tickets:create'), createInternalTicketController);
router.patch('/internal-tickets/:id', requireAdminAuth, requireAdminPermission('admin:tickets:manage'), updateInternalTicketController);
router.post('/internal-tickets/:id/comments', requireAdminAuth, requireAdminPermission('admin:tickets:view'), addInternalTicketCommentController);

router.get('/support/chats', requireAdminAuth, requireAdminPermission('admin:support:view'), listLiveChatsController);
router.get('/support/chats/:id', requireAdminAuth, requireAdminPermission('admin:support:view'), getLiveChatByIdController);
router.get('/support/chats/:id/messages', requireAdminAuth, requireAdminPermission('admin:support:view'), getLiveChatMessagesController);
router.post('/support/chats/:id/claim', requireAdminAuth, requireAdminPermission('admin:support:manage'), claimLiveChatController);
router.post('/support/chats/:id/transfer', requireAdminAuth, requireAdminPermission('admin:support:manage'), transferLiveChatController);
router.post('/support/chats/:id/close', requireAdminAuth, requireAdminPermission('admin:support:manage'), closeLiveChatController);
router.post('/support/chats/:id/messages', requireAdminAuth, requireAdminPermission('admin:support:manage'), sendAgentMessageController);

export default router;
