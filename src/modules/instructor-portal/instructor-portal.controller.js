import * as service from './instructor-portal.service.js';
import validation from './instructor-portal.validation.js';

function getReqContext(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

export async function getDashboardOverview(req, res, next) {
  try {
    const data = await service.getDashboardOverview(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getCourses(req, res, next) {
  try {
    const data = await service.getCourses(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getCourseDetails(req, res, next) {
  try {
    const courseId = Number(req.params.courseId);
    const data = await service.getCourseDetails(req.user.id, courseId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getBatches(req, res, next) {
  try {
    const data = await service.getBatches(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getStudents(req, res, next) {
  try {
    const data = await service.getStudents(req.user.id, req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
}

export async function getDemos(req, res, next) {
  try {
    const data = await service.getDemos(req.user.id, req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
}

export async function updateDemoStatus(req, res, next) {
  try {
    const demoId = Number(req.params.demoId);
    const parsed = validation.updateDemoStatusSchema.parse(req.body);
    const data = await service.updateDemoStatus(req.user.id, demoId, parsed, getReqContext(req));
    res.json({ success: true, message: 'Demo request updated successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function getSessions(req, res, next) {
  try {
    const data = await service.getSessions(req.user.id, req.query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createSession(req, res, next) {
  try {
    const parsed = validation.createSessionSchema.parse(req.body);
    const data = await service.createSession(req.user.id, parsed, getReqContext(req));
    res.status(201).json({ success: true, message: 'Session scheduled successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function updateSession(req, res, next) {
  try {
    const sessionId = Number(req.params.sessionId);
    const parsed = validation.updateSessionSchema.parse(req.body);
    const data = await service.updateSession(req.user.id, sessionId, parsed, getReqContext(req));
    res.json({ success: true, message: 'Session updated successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function getSessionAttendance(req, res, next) {
  try {
    const sessionId = Number(req.params.sessionId);
    const data = await service.getSessionAttendance(req.user.id, sessionId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function saveSessionAttendance(req, res, next) {
  try {
    const sessionId = Number(req.params.sessionId);
    const parsed = validation.markAttendanceSchema.parse(req.body);
    const data = await service.saveSessionAttendance(req.user.id, sessionId, parsed.records, getReqContext(req));
    res.json({ success: true, message: 'Attendance recorded successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function getMaterials(req, res, next) {
  try {
    const data = await service.getMaterials(req.user.id, req.query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createMaterial(req, res, next) {
  try {
    const parsed = validation.createMaterialSchema.parse(req.body);
    const data = await service.createMaterial(req.user.id, parsed, getReqContext(req));
    res.status(201).json({ success: true, message: 'Study material uploaded successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function deleteMaterial(req, res, next) {
  try {
    const materialId = Number(req.params.materialId);
    await service.deleteMaterial(req.user.id, materialId, getReqContext(req));
    res.json({ success: true, message: 'Study material deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function createModule(req, res, next) {
  try {
    const courseId = Number(req.params.courseId);
    const parsed = validation.createModuleSchema.parse(req.body);
    const data = await service.createModule(req.user.id, courseId, parsed);
    res.status(201).json({ success: true, message: 'Module created successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function updateModule(req, res, next) {
  try {
    const moduleId = Number(req.params.moduleId);
    const parsed = validation.updateModuleSchema.parse(req.body);
    const data = await service.updateModule(req.user.id, moduleId, parsed);
    res.json({ success: true, message: 'Module updated successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function deleteModule(req, res, next) {
  try {
    const moduleId = Number(req.params.moduleId);
    await service.deleteModule(req.user.id, moduleId);
    res.json({ success: true, message: 'Module deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function createLesson(req, res, next) {
  try {
    const moduleId = Number(req.params.moduleId);
    const parsed = validation.createLessonSchema.parse(req.body);
    const data = await service.createLesson(req.user.id, moduleId, parsed);
    res.status(201).json({ success: true, message: 'Lesson created successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function updateLesson(req, res, next) {
  try {
    const lessonId = Number(req.params.lessonId);
    const parsed = validation.updateLessonSchema.parse(req.body);
    const data = await service.updateLesson(req.user.id, lessonId, parsed);
    res.json({ success: true, message: 'Lesson updated successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function deleteLesson(req, res, next) {
  try {
    const lessonId = Number(req.params.lessonId);
    await service.deleteLesson(req.user.id, lessonId);
    res.json({ success: true, message: 'Lesson deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function getProfile(req, res, next) {
  try {
    const data = await service.getProfile(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const parsed = validation.updateInstructorProfileSchema.parse(req.body);
    const data = await service.updateProfile(req.user.id, parsed, getReqContext(req));
    res.json({ success: true, message: 'Profile updated successfully', data });
  } catch (error) {
    next(error);
  }
}

export default {
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
