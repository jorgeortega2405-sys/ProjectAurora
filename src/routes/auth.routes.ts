import { Router } from 'express';
import { forgotPassword, googleCallback, login, logout, logoutAll, me, redirectToGoogle, resendRegistrationCode, resetPassword, sendRegistrationCode, switchAccount, validateResetToken, validateStage1, verify2FALogin, verifyRegistrationCode } from '../controllers/auth.controller.js';
import { handleAvatarRequest } from '../controllers/avatar.controller.js';
import { forgotPasswordLimiter, loginLimiter, registerLimiter, resetPasswordLimiter, sendCodeLimiter, twoFactorVerifyLimiter, verifyCodeLimiter } from '../middlewares/rate-limit.middleware.js';

const router = Router();

router.post('/register/stage1-validate', registerLimiter, validateStage1);
router.post('/register/send-code', sendCodeLimiter, sendRegistrationCode);
router.post('/register/verify-code', verifyCodeLimiter, verifyRegistrationCode);
router.post('/register/resend-code', sendCodeLimiter, resendRegistrationCode);
router.post('/register', verifyCodeLimiter, verifyRegistrationCode);
router.post('/login', loginLimiter, login);
router.post('/login/verify-2fa', twoFactorVerifyLimiter, verify2FALogin);
router.post('/login/2fa/verify', twoFactorVerifyLimiter, verify2FALogin);
router.post('/logout', logout);
router.post('/logout-all', logoutAll);
router.post('/auth/logout-all', logoutAll);
router.post('/switch-account', switchAccount);
router.post('/auth/switch-account', switchAccount);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.get('/reset-password/validate', validateResetToken);
router.post('/reset-password', resetPasswordLimiter, resetPassword);
router.get('/me', me);
router.get('/auth/google', redirectToGoogle);
router.get('/auth/google/callback', googleCallback);
router.get('/avatar', handleAvatarRequest);

export default router;

