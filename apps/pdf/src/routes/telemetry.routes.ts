import { getTelemetryHealthHandler, ingestBatchHandler, ingestBeaconHandler } from '../controllers/telemetry.controller.js';
import express, { Router } from 'express';

const router = Router();

router.post('/telemetry/v1/batch', ingestBatchHandler);
router.post('/telemetry/v1/beacon', express.text({ type: ['text/plain', 'application/json'] }), ingestBeaconHandler);
router.get('/telemetry/v1/health', getTelemetryHealthHandler);

export default router;
