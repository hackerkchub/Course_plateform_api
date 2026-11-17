import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as controller from './contact.controller.js';

// Public contact submission
export const publicContactRouter = Router();
publicContactRouter.post('/', controller.submitContact);

// Admin contact management
export const adminContactRouter = Router();
adminContactRouter.use(authenticate, authorize('counsellor', 'admin', 'super_admin'));

adminContactRouter.get('/', controller.listContacts);
adminContactRouter.get('/:id', controller.getContactById);
adminContactRouter.patch('/:id/status', controller.updateContactStatus);
adminContactRouter.patch('/:id/assign', controller.assignContact);

export default {
  publicContactRouter,
  adminContactRouter,
};
