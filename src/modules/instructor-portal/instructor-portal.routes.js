import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as controller from './instructor-portal.controller.js';

const router = Router();

// Strict guard: Must be authenticated and have instructor or higher role
router.use(authenticate, authorize('instructor', 'admin', 'super_admin'));

// 1. Overview Dashboard
router.get('/overview', controller.getDashboardOverview);

// 2. Courses
router.get('/courses', controller.getCourses);
router.get('/courses/:courseId', controller.getCourseDetails);

// Curriculum Management (guarded by can_manage_curriculum in service)
router.post('/courses/:courseId/modules', controller.createModule);
router.patch('/modules/:moduleId', controller.updateModule);
router.delete('/modules/:moduleId', controller.deleteModule);
router.post('/modules/:moduleId/lessons', controller.createLesson);
router.patch('/lessons/:lessonId', controller.updateLesson);
router.delete('/lessons/:lessonId', controller.deleteLesson);

// 3. Batches
router.get('/batches', controller.getBatches);

// 4. Students (isolated)
router.get('/students', controller.getStudents);

// 5. Demo bookings
router.get('/demos', controller.getDemos);
router.patch('/demos/:demoId', controller.updateDemoStatus);

// 6. Schedule & Sessions
router.get('/sessions', controller.getSessions);
router.post('/sessions', controller.createSession);
router.patch('/sessions/:sessionId', controller.updateSession);

// 7. Attendance
router.get('/sessions/:sessionId/attendance', controller.getSessionAttendance);
router.post('/sessions/:sessionId/attendance', controller.saveSessionAttendance);

// 8. Study materials
router.get('/materials', controller.getMaterials);
router.post('/materials', controller.createMaterial);
router.delete('/materials/:materialId', controller.deleteMaterial);

// 9. Profile / Settings
router.get('/profile', controller.getProfile);
router.patch('/profile', controller.updateProfile);

export default router;
