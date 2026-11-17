import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  createWhatsAppContactSchema,
  updateWhatsAppContactSchema,
  updateStatusSchema,
  listWhatsAppContactsQuerySchema,
  previewQuerySchema,
} from './whatsapp.validation.js';
import {
  listContacts,
  getContact,
  createContact,
  updateContact,
  setDefaultContact,
  updateContactStatus,
  deleteContact,
  getPreview,
} from './whatsapp.controller.js';

const router = Router();

// Strictly require authenticated Admin or Super Admin
router.use(authenticate, authorize('admin', 'super_admin'));

router.get('/', validateQuery(listWhatsAppContactsQuerySchema), listContacts);
router.post('/', validateBody(createWhatsAppContactSchema), createContact);
router.get('/:id', getContact);
router.put('/:id', validateBody(updateWhatsAppContactSchema), updateContact);
router.post('/:id/set-default', setDefaultContact);
router.patch('/:id/status', validateBody(updateStatusSchema), updateContactStatus);
router.delete('/:id', deleteContact);
router.get('/:id/preview', validateQuery(previewQuerySchema), getPreview);

export { router as adminWhatsAppRouter };
export default router;
