import { createWorkflowHandler, deleteWorkflowHandler, downloadWorkflowResultHandler, executeWorkflowHandler, getWorkflowHandler, getWorkflowsHandler, updateWorkflowHandler } from '../controllers/workflow.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';

const router = Router();

const upload = multer({
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1,
  },
  storage: multer.memoryStorage(),
}).single('file');

function uploadWorkflowFileMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: 'El archivo excede el tamaño máximo permitido (100MB)', success: false });
      return;
    }
    next();
  });
}

router.get('/settings/workflows', requireAuth, getWorkflowsHandler);
router.post('/settings/workflows', requireAuth, createWorkflowHandler);
router.get('/settings/workflows/:id', requireAuth, getWorkflowHandler);
router.put('/settings/workflows/:id', requireAuth, updateWorkflowHandler);
router.delete('/settings/workflows/:id', requireAuth, deleteWorkflowHandler);

router.get('/workflows', requireAuth, getWorkflowsHandler);
router.post('/workflows', requireAuth, createWorkflowHandler);
router.get('/workflows/:id', requireAuth, getWorkflowHandler);
router.put('/workflows/:id', requireAuth, updateWorkflowHandler);
router.delete('/workflows/:id', requireAuth, deleteWorkflowHandler);
router.post('/workflows/:id/execute', requireAuth, uploadWorkflowFileMiddleware, executeWorkflowHandler);
router.get('/workflows/download/:token', downloadWorkflowResultHandler);

export default router;
