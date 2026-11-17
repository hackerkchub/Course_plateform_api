import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  provisionCounsellorSchema,
  updateCounsellorStatusSchema,
  promoteStudentSchema,
  listCounsellorsQuerySchema,
} from './counsellor-admin.validation.js';
import {
  provisionCounsellor,
  listCounsellors,
  getCounsellor,
  updateCounsellorStatus,
  promoteStudent,
} from './counsellor-admin.controller.js';

const router = Router();

// Strictly require authenticated Admin or Super Admin for all staff management endpoints
router.use(authenticate, authorize('admin', 'super_admin'));

/**
 * Staff & Counsellor Management Routes
 * Base: /api/admin/users/counsellors
 */

// 1. Provision New Counsellor
router.post('/', validateBody(provisionCounsellorSchema), provisionCounsellor);

// 2. List Counsellors with search & status filters
router.get('/', validateQuery(listCounsellorsQuerySchema), listCounsellors);

// 3. Promote Existing Student to Counsellor (Declared before /:id parameter)
router.post('/promote', validateBody(promoteStudentSchema), promoteStudent);

// 4. Get Counsellor Details & Lead Statistics
router.get('/:id', getCounsellor);

// 5. Update Counsellor Account Status (Active / Blocked)
router.patch('/:id/status', validateBody(updateCounsellorStatusSchema), updateCounsellorStatus);

export { router as counsellorAdminRoutes };
export default router;
