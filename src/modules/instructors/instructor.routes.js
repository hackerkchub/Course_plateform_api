import express from 'express';
import { validateBody } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  createInstructorSchema,
  updateInstructorSchema,
  provisionInstructorSchema,
  updateInstructorStatusSchema,
  assignCourseInstructorSchema,
  updateCourseInstructorSchema,
  assignBatchInstructorSchema,
} from './instructor.validation.js';
import {
  getInstructors,
  getInstructorById,
  getAdminInstructors,
  createInstructor,
  updateInstructor,
  deleteInstructor,
  provisionInstructor,
  updateInstructorStatus,
  getCourseInstructors,
  assignInstructorToCourse,
  reassignPrimaryInstructor,
  updateCourseInstructor,
  removeInstructorFromCourse,
  assignInstructorToBatch,
} from './instructor.controller.js';

// Public routes: /api/instructors
const publicRouter = express.Router();
publicRouter.get('/', getInstructors);
publicRouter.get('/:id', getInstructorById);

// Admin routes: /api/admin/instructors
const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('admin', 'super_admin'));

adminRouter.get('/', getAdminInstructors);
adminRouter.post('/', validateBody(createInstructorSchema), createInstructor);
adminRouter.post('/provision', validateBody(provisionInstructorSchema), provisionInstructor);
adminRouter.post('/:id/provision', validateBody(provisionInstructorSchema), provisionInstructor);
adminRouter.patch('/:id/status', validateBody(updateInstructorStatusSchema), updateInstructorStatus);

// Course and Batch assignment management
adminRouter.get('/courses/:courseId', getCourseInstructors);
adminRouter.post('/courses/:courseId', validateBody(assignCourseInstructorSchema), assignInstructorToCourse);
adminRouter.post('/courses/:courseId/primary', reassignPrimaryInstructor);
adminRouter.patch('/courses/:courseId/:instructorId', validateBody(updateCourseInstructorSchema), updateCourseInstructor);
adminRouter.delete('/courses/:courseId/:instructorId', removeInstructorFromCourse);
adminRouter.post('/batches/:batchId', validateBody(assignBatchInstructorSchema), assignInstructorToBatch);
adminRouter.patch('/batches/:batchId', validateBody(assignBatchInstructorSchema), assignInstructorToBatch);

adminRouter.get('/:id', getInstructorById);
adminRouter.patch('/:id', validateBody(updateInstructorSchema), updateInstructor);
adminRouter.delete('/:id', deleteInstructor);

export {
  publicRouter as instructorPublicRoutes,
  adminRouter as instructorAdminRoutes,
};

export default {
  instructorPublicRoutes: publicRouter,
  instructorAdminRoutes: adminRouter,
};
