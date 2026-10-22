import { getSsoConfigHandler, ssoCallbackHandler, ssoConfigHandler, ssoInitiateHandler, ssoLookupHandler, ssoSamlCallbackHandler, ssoSamlMetadataHandler } from '../controllers/sso.controller.js';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware.js';
import { Router, urlencoded } from 'express';

const router = Router();

router.get('/auth/sso/lookup', ssoLookupHandler);
router.get('/auth/sso/initiate', ssoInitiateHandler);
router.get('/auth/sso/callback', ssoCallbackHandler);
router.get('/auth/sso/saml/metadata', ssoSamlMetadataHandler);
router.post('/auth/sso/saml/callback', urlencoded({ extended: false }), ssoSamlCallbackHandler);
router.get('/auth/sso/config', requireAuth, requirePermission('org:sso:configure'), getSsoConfigHandler);
router.post('/auth/sso/config', requireAuth, requirePermission('org:sso:configure'), ssoConfigHandler);

export default router;
