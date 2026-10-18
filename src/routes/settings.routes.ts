import { handleDeleteAccount, handleDeleteAvatar, handleDisable2FA, handleEnable2FA, handleGenerate2FA, handleGet2FAStatus, handleGetPasswordStatus, handleGetPreferences, handleRequestEmailChangeCode, handleUnlinkGoogle, handleUpdateAvatar, handleUpdateEmail, handleUpdatePassword, handleUpdatePreferences, handleUpdateUsername, handleVerifyCurrentPassword, handleVerifyEmailChangeCode } from '../controllers/settings.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { avatarLimiter, emailCodeLimiter, preferencesLimiter, twoFactorGenerateLimiter, twoFactorVerifyLimiter, updatePasswordLimiter, updateUsernameLimiter, verifyEmailCodeLimiter, verifyPasswordLimiter } from '../middlewares/rate-limit.middleware.js';
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de imagen no compatible. Usa PNG, JPG o WEBP.'));
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  storage,
});

function uploadAvatarMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('avatar')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'La imagen supera el límite permitido de 2 MB.', ok: false, success: false });
        return;
      }
      res.status(400).json({ error: 'Error al procesar el archivo.', ok: false, success: false });
      return;
    } else if (err) {
      res.status(400).json({ error: err.message || 'El archivo enviado no es válido.', ok: false, success: false });
      return;
    }
    next();
  });
}


router.post('/settings/avatar', requireAuth, avatarLimiter, uploadAvatarMiddleware, handleUpdateAvatar);
router.delete('/settings/avatar', requireAuth, avatarLimiter, handleDeleteAvatar);
router.post('/settings/avatar/delete', requireAuth, avatarLimiter, handleDeleteAvatar);
router.post('/settings/username', requireAuth, updateUsernameLimiter, handleUpdateUsername);
router.post('/settings/profile', requireAuth, updateUsernameLimiter, handleUpdateUsername);
router.post('/settings/email/request-code', requireAuth, emailCodeLimiter, handleRequestEmailChangeCode);
router.post('/settings/email/verify-code', requireAuth, verifyEmailCodeLimiter, handleVerifyEmailChangeCode);
router.post('/settings/email', requireAuth, handleUpdateEmail);
router.get('/settings/preferences', requireAuth, handleGetPreferences);
router.post('/settings/preferences', requireAuth, preferencesLimiter, handleUpdatePreferences);
router.get('/settings/password/status', requireAuth, handleGetPasswordStatus);
router.get('/settings/password-status', requireAuth, handleGetPasswordStatus);
router.post('/settings/password/verify', requireAuth, verifyPasswordLimiter, handleVerifyCurrentPassword);
router.post('/settings/password', requireAuth, updatePasswordLimiter, handleUpdatePassword);
router.post('/settings/2fa/generate', requireAuth, twoFactorGenerateLimiter, handleGenerate2FA);
router.post('/settings/2fa/enable', requireAuth, twoFactorVerifyLimiter, handleEnable2FA);
router.post('/settings/2fa/disable', requireAuth, handleDisable2FA);
router.get('/settings/2fa/status', requireAuth, handleGet2FAStatus);
router.post('/settings/account/delete', requireAuth, verifyPasswordLimiter, handleDeleteAccount);
router.post('/settings/google/unlink', requireAuth, handleUnlinkGoogle);

export default router;
