import * as repo from './instructor-portal.repository.js';
import { logAudit } from '../../middleware/audit.js';

export class ForbiddenError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export class BadRequestError extends Error {
  constructor(message = 'Invalid request') {
    super(message);
    this.name = 'BadRequestError';
    this.statusCode = 400;
  }
}

/**
 * Resolves the authenticated user to their active instructor profile
 */
export async function resolveInstructor(userId) {
  const instructor = await repo.resolveInstructorByUserId(userId);
  if (!instructor) {
    throw new ForbiddenError('No active instructor profile linked to this user account.');
  }
  return instructor;
}

/**
 * 1. Overview dashboard metrics
 */
export async function getDashboardOverview(userId) {
  const instructor = await resolveInstructor(userId);
  const metrics = await repo.getInstructorDashboardMetrics(instructor.id);
  return {
    instructor: {
      id: instructor.id,
      name: instructor.name,
      designation: instructor.designation,
      photo_url: instructor.photo_url,
    },
    metrics,
  };
}

/**
 * 2. Assigned courses list
 */
export async function getCourses(userId) {
  const instructor = await resolveInstructor(userId);
  return repo.getInstructorCourses(instructor.id);
}

/**
 * 2. Course details
 */
export async function getCourseDetails(userId, courseId) {
  const instructor = await resolveInstructor(userId);
  const course = await repo.getInstructorCourseById(instructor.id, courseId);
  if (!course) {
    throw new NotFoundError('Course not found or you are not assigned to this course.');
  }
  return course;
}

/**
 * 3. Assigned batches
 */
export async function getBatches(userId) {
  const instructor = await resolveInstructor(userId);
  return repo.getInstructorBatches(instructor.id);
}

/**
 * 4. Students enrolled in instructor's courses/batches (strictly isolated)
 */
export async function getStudents(userId, query) {
  const instructor = await resolveInstructor(userId);
  return repo.getInstructorStudents(instructor.id, {
    courseId: query.course_id ? Number(query.course_id) : undefined,
    batchId: query.batch_id ? Number(query.batch_id) : undefined,
    search: query.search || undefined,
    limit: query.limit ? Number(query.limit) : 25,
    offset: query.offset ? Number(query.offset) : 0,
  });
}

/**
 * 5. Demo bookings for instructor's courses
 */
export async function getDemos(userId, query) {
  const instructor = await resolveInstructor(userId);
  return repo.getInstructorDemos(instructor.id, {
    status: query.status,
    limit: query.limit ? Number(query.limit) : 20,
    offset: query.offset ? Number(query.offset) : 0,
  });
}

/**
 * 5. Update demo status/notes
 */
export async function updateDemoStatus(userId, demoId, data, reqContext = {}) {
  const instructor = await resolveInstructor(userId);
  const updated = await repo.updateDemoRequest(instructor.id, demoId, data);
  if (!updated) {
    throw new NotFoundError('Demo request not found or does not belong to your assigned courses.');
  }

  await logAudit({
    user_id: userId,
    action: 'INSTRUCTOR_DEMO_UPDATE',
    resource_type: 'demo_requests',
    resource_id: demoId,
    new_values: data,
    ip_address: reqContext.ip,
    user_agent: reqContext.userAgent,
  }).catch(() => {});

  return updated;
}

/**
 * 6. Batch sessions
 */
export async function getSessions(userId, query) {
  const instructor = await resolveInstructor(userId);
  return repo.getInstructorSessions(instructor.id, {
    batchId: query.batch_id ? Number(query.batch_id) : undefined,
    dateFrom: query.date_from,
    dateTo: query.date_to,
  });
}

/**
 * 6. Create session
 */
export async function createSession(userId, data, reqContext = {}) {
  const instructor = await resolveInstructor(userId);
  const isAssigned = await repo.checkBatchAssignment(instructor.id, data.batch_id);
  if (!isAssigned) {
    throw new ForbiddenError('You are not assigned to conduct sessions for this batch.');
  }

  const session = await repo.createSession(instructor.id, data);

  await logAudit({
    user_id: userId,
    action: 'INSTRUCTOR_SESSION_CREATE',
    resource_type: 'batch_sessions',
    resource_id: session.id,
    new_values: data,
    ip_address: reqContext.ip,
    user_agent: reqContext.userAgent,
  }).catch(() => {});

  return session;
}

/**
 * 6. Update session
 */
export async function updateSession(userId, sessionId, data, reqContext = {}) {
  const instructor = await resolveInstructor(userId);
  const updated = await repo.updateSession(instructor.id, sessionId, data);
  if (!updated) {
    throw new NotFoundError('Session not found or update could not be completed.');
  }

  await logAudit({
    user_id: userId,
    action: 'INSTRUCTOR_SESSION_UPDATE',
    resource_type: 'batch_sessions',
    resource_id: sessionId,
    new_values: data,
    ip_address: reqContext.ip,
    user_agent: reqContext.userAgent,
  }).catch(() => {});

  return updated;
}

/**
 * 7. Attendance: Get session attendance sheet
 */
export async function getSessionAttendance(userId, sessionId) {
  const instructor = await resolveInstructor(userId);
  const sheet = await repo.getSessionAttendance(sessionId);
  if (!sheet) {
    throw new NotFoundError('Session not found.');
  }

  const isAssigned = await repo.checkBatchAssignment(instructor.id, sheet.session.batch_id);
  if (!isAssigned) {
    throw new ForbiddenError('You are not authorized to view attendance for this batch session.');
  }

  return sheet;
}

/**
 * 7. Attendance: Save session attendance records
 */
export async function saveSessionAttendance(userId, sessionId, records, reqContext = {}) {
  const instructor = await resolveInstructor(userId);
  const sheet = await repo.getSessionAttendance(sessionId);
  if (!sheet) {
    throw new NotFoundError('Session not found.');
  }

  const isAssigned = await repo.checkBatchAssignment(instructor.id, sheet.session.batch_id);
  if (!isAssigned) {
    throw new ForbiddenError('You are not authorized to mark attendance for this batch session.');
  }

  const result = await repo.saveSessionAttendance(sessionId, records, userId);

  await logAudit({
    user_id: userId,
    action: 'INSTRUCTOR_ATTENDANCE_SAVE',
    resource_type: 'batch_attendance',
    resource_id: sessionId,
    new_values: { count: records.length },
    ip_address: reqContext.ip,
    user_agent: reqContext.userAgent,
  }).catch(() => {});

  return result;
}

/**
 * 8. Study materials
 */
export async function getMaterials(userId, query) {
  const instructor = await resolveInstructor(userId);
  return repo.getInstructorMaterials(instructor.id, {
    courseId: query.course_id ? Number(query.course_id) : undefined,
  });
}

/**
 * 8. Add study material
 */
export async function createMaterial(userId, data, reqContext = {}) {
  const instructor = await resolveInstructor(userId);
  const assignment = await repo.checkCourseAssignment(instructor.id, data.course_id);
  if (!assignment.isAssigned) {
    throw new ForbiddenError('You are not assigned to this course.');
  }

  const material = await repo.createMaterial(instructor.id, userId, data);

  await logAudit({
    user_id: userId,
    action: 'INSTRUCTOR_MATERIAL_CREATE',
    resource_type: 'course_materials',
    resource_id: material.id,
    new_values: { course_id: data.course_id, title: data.title },
    ip_address: reqContext.ip,
    user_agent: reqContext.userAgent,
  }).catch(() => {});

  return material;
}

/**
 * 8. Delete study material
 */
export async function deleteMaterial(userId, materialId, reqContext = {}) {
  const instructor = await resolveInstructor(userId);
  const success = await repo.deleteMaterial(instructor.id, materialId);
  if (!success) {
    throw new NotFoundError('Material not found or you are not authorized to delete it.');
  }

  await logAudit({
    user_id: userId,
    action: 'INSTRUCTOR_MATERIAL_DELETE',
    resource_type: 'course_materials',
    resource_id: materialId,
    ip_address: reqContext.ip,
    user_agent: reqContext.userAgent,
  }).catch(() => {});

  return { success: true };
}

/**
 * 9. Curriculum Management (Guarded by can_manage_curriculum)
 */
async function verifyCurriculumPermission(instructorId, courseId) {
  const assignment = await repo.checkCourseAssignment(instructorId, courseId);
  if (!assignment.isAssigned) {
    throw new ForbiddenError('You are not assigned to this course.');
  }
  if (!assignment.canManageCurriculum) {
    throw new ForbiddenError('Curriculum management permission is restricted for this course assignment.');
  }
}

export async function createModule(userId, courseId, data) {
  const instructor = await resolveInstructor(userId);
  await verifyCurriculumPermission(instructor.id, courseId);
  return repo.createModule(courseId, data);
}

export async function updateModule(userId, moduleId, data) {
  const instructor = await resolveInstructor(userId);
  const mod = await repo.findModuleWithCourse(moduleId);
  if (!mod) throw new NotFoundError('Module not found.');
  await verifyCurriculumPermission(instructor.id, mod.course_id);
  return repo.updateModule(moduleId, data);
}

export async function deleteModule(userId, moduleId) {
  const instructor = await resolveInstructor(userId);
  const mod = await repo.findModuleWithCourse(moduleId);
  if (!mod) throw new NotFoundError('Module not found.');
  await verifyCurriculumPermission(instructor.id, mod.course_id);
  return repo.deleteModule(moduleId);
}

export async function createLesson(userId, moduleId, data) {
  const instructor = await resolveInstructor(userId);
  const mod = await repo.findModuleWithCourse(moduleId);
  if (!mod) throw new NotFoundError('Module not found.');
  await verifyCurriculumPermission(instructor.id, mod.course_id);
  return repo.createLesson(moduleId, data);
}

export async function updateLesson(userId, lessonId, data) {
  const instructor = await resolveInstructor(userId);
  const lesson = await repo.findLessonWithCourse(lessonId);
  if (!lesson) throw new NotFoundError('Lesson not found.');
  await verifyCurriculumPermission(instructor.id, lesson.course_id);
  return repo.updateLesson(lessonId, data);
}

export async function deleteLesson(userId, lessonId) {
  const instructor = await resolveInstructor(userId);
  const lesson = await repo.findLessonWithCourse(lessonId);
  if (!lesson) throw new NotFoundError('Lesson not found.');
  await verifyCurriculumPermission(instructor.id, lesson.course_id);
  return repo.deleteLesson(lessonId);
}

/**
 * 10. Profile details
 */
export async function getProfile(userId) {
  const instructor = await resolveInstructor(userId);
  return instructor;
}

export async function updateProfile(userId, data, reqContext = {}) {
  const instructor = await resolveInstructor(userId);
  const updated = await repo.updateInstructorProfile(instructor.id, data);

  await logAudit({
    user_id: userId,
    action: 'INSTRUCTOR_PROFILE_UPDATE',
    resource_type: 'instructors',
    resource_id: instructor.id,
    new_values: data,
    ip_address: reqContext.ip,
    user_agent: reqContext.userAgent,
  }).catch(() => {});

  return updated;
}

export default {
  resolveInstructor,
  getDashboardOverview,
  getCourses,
  getCourseDetails,
  getBatches,
  getStudents,
  getDemos,
  updateDemoStatus,
  getSessions,
  createSession,
  updateSession,
  getSessionAttendance,
  saveSessionAttendance,
  getMaterials,
  createMaterial,
  deleteMaterial,
  createModule,
  updateModule,
  deleteModule,
  createLesson,
  updateLesson,
  deleteLesson,
  getProfile,
  updateProfile,
};
