import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { parsePagination } from '../../utils/pagination.js';
import {
  getActiveInstructors,
  getInstructorById as getInstructorByIdService,
  getInstructorsAdmin,
  createInstructor as createInstructorService,
  updateInstructor as updateInstructorService,
  deleteInstructor as deleteInstructorService,
  provisionInstructor as provisionInstructorService,
  updateInstructorStatus as updateInstructorStatusService,
  getCourseInstructors as getCourseInstructorsService,
  assignInstructorToCourse as assignInstructorToCourseService,
  reassignPrimaryInstructor as reassignPrimaryInstructorService,
  updateCourseInstructor as updateCourseInstructorService,
  removeInstructorFromCourse as removeInstructorFromCourseService,
  assignInstructorToBatch as assignInstructorToBatchService,
} from './instructor.service.js';

export async function getInstructors(req, res, next) {
  try {
    const instructors = await getActiveInstructors();
    return sendSuccess(res, 'Instructors retrieved successfully', instructors, 200);
  } catch (error) {
    next(error);
  }
}

export async function getInstructorById(req, res, next) {
  try {
    const { id } = req.params;
    const instructor = await getInstructorByIdService(Number(id));
    return sendSuccess(res, 'Instructor details retrieved successfully', instructor, 200);
  } catch (error) {
    next(error);
  }
}

export async function getAdminInstructors(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 20);
    const { status, search } = req.query;

    const { instructors, total } = await getInstructorsAdmin({
      status,
      search,
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return sendPaginated(res, instructors, pagination.page, pagination.limit, total, 200);
  } catch (error) {
    next(error);
  }
}

export async function createInstructor(req, res, next) {
  try {
    const newInstructor = await createInstructorService(req.body, req.user?.id, req.ip);
    return sendSuccess(res, 'Instructor created successfully', newInstructor, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateInstructor(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await updateInstructorService(Number(id), req.body, req.user?.id, req.ip);
    return sendSuccess(res, 'Instructor updated successfully', updated, 200);
  } catch (error) {
    next(error);
  }
}

export async function deleteInstructor(req, res, next) {
  try {
    const { id } = req.params;
    await deleteInstructorService(Number(id), req.user?.id, req.ip);
    return sendSuccess(res, 'Instructor deactivated successfully', {}, 200);
  } catch (error) {
    next(error);
  }
}

export async function provisionInstructor(req, res, next) {
  try {
    const payload = { ...req.body };
    if (req.params.id && !payload.instructor_id) {
      payload.instructor_id = Number(req.params.id);
    }
    const result = await provisionInstructorService(payload, req.user, req.ip);
    return sendSuccess(res, 'Instructor account provisioned and linked successfully', result, 200);
  } catch (error) {
    next(error);
  }
}

export async function updateInstructorStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await updateInstructorStatusService(Number(id), status, req.user, req.ip);
    return sendSuccess(res, `Instructor account status updated to ${status}`, result, 200);
  } catch (error) {
    next(error);
  }
}

export async function getCourseInstructors(req, res, next) {
  try {
    const { courseId } = req.params;
    const instructors = await getCourseInstructorsService(Number(courseId));
    return sendSuccess(res, 'Course instructors retrieved successfully', instructors, 200);
  } catch (error) {
    next(error);
  }
}

export async function assignInstructorToCourse(req, res, next) {
  try {
    const { courseId } = req.params;
    const result = await assignInstructorToCourseService(Number(courseId), req.body, req.user, req.ip);
    return sendSuccess(res, 'Instructor assigned to course successfully', result, 201);
  } catch (error) {
    next(error);
  }
}

export async function reassignPrimaryInstructor(req, res, next) {
  try {
    const { courseId } = req.params;
    const { instructor_id, can_manage_curriculum = 1 } = req.body;
    const result = await reassignPrimaryInstructorService(Number(courseId), Number(instructor_id), can_manage_curriculum, req.user, req.ip);
    return sendSuccess(res, 'Primary instructor reassigned successfully', result, 200);
  } catch (error) {
    next(error);
  }
}

export async function updateCourseInstructor(req, res, next) {
  try {
    const { courseId, instructorId } = req.params;
    const result = await updateCourseInstructorService(Number(courseId), Number(instructorId), req.body, req.user, req.ip);
    return sendSuccess(res, 'Course instructor assignment updated successfully', result, 200);
  } catch (error) {
    next(error);
  }
}

export async function removeInstructorFromCourse(req, res, next) {
  try {
    const { courseId, instructorId } = req.params;
    const result = await removeInstructorFromCourseService(Number(courseId), Number(instructorId), req.user, req.ip);
    return sendSuccess(res, 'Instructor removed from course successfully', result, 200);
  } catch (error) {
    next(error);
  }
}

export async function assignInstructorToBatch(req, res, next) {
  try {
    const { batchId } = req.params;
    const { instructor_id } = req.body;
    const result = await assignInstructorToBatchService(Number(batchId), instructor_id, req.user, req.ip);
    return sendSuccess(res, 'Batch instructor assigned successfully', result, 200);
  } catch (error) {
    next(error);
  }
}

export default {
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
};
