import { handleFetchCloudFile } from './cloud.controller.js';
import { Router } from 'express';

const router = Router();

router.post('/tools/cloud/fetch-file', handleFetchCloudFile);

export default router;
