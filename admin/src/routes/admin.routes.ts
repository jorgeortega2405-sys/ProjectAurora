import { Router } from 'express';
import { getAdminHealth, getAdminUsers } from '../controllers/admin.controller.js';

const router = Router();

router.get('/health', getAdminHealth);
router.get('/users', getAdminUsers);

export default router;
