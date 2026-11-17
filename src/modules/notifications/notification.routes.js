import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as controller from './notification.controller.js';

// Public / User WhatsApp consent router
export const notificationPublicRouter = Router();
notificationPublicRouter.post('/whatsapp/consent', controller.recordWhatsAppConsent);
notificationPublicRouter.get('/whatsapp/consent', controller.getWhatsAppConsentStatus);

// Admin notification management router
export const notificationAdminRouter = Router();
notificationAdminRouter.use(authenticate, authorize('admin', 'super_admin'));

notificationAdminRouter.get('/settings', controller.getSettings);
notificationAdminRouter.patch('/settings/:eventType', controller.updateSetting);
notificationAdminRouter.get('/logs', controller.getLogs);
notificationAdminRouter.post('/logs/:id/retry', controller.retryLog);

export default {
  notificationPublicRouter,
  notificationAdminRouter,
};
