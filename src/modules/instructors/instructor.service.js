import { getPool } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';
import { createAuditLog } from '../../utils/auditLogger.js';
import {
  findActiveInstructors,
  findInstructorById,
  findInstructorByUserId,
  findInstructorByEmail,
  findInstructorsAdmin,
  createInstructor as repoCreateInstructor,
  updateInstructor as repoUpdateInstructor,
  deleteInstructor as repoDeleteInstructor,
  findUserByNormalizedEmail,
  createUserForInstructor,
  linkInstructorToUser,
  updateLinkedUserStatus,
  revokeUserRefreshTokens,
  findCourseInstructors,
  assignInstructorToCourse as repoAssignInstructorToCourse,
  reassignPrimaryInstructor as repoReassignPrimaryInstructor,
  updateCourseInstructor as repoUpdateCourseInstructor,
  removeInstructorFromCourse as repoRemoveInstructorFromCourse,
  assignInstructorToBatch as repoAssignInstructorToBatch,
} from './instructor.repository.js';

export async function getActiveInstructors() {
  return findActiveInstructors();
}

export async function getInstructorById(id) {
  const instructor = await findInstructorById(id);
  if (!instructor) {
    throw new AppError('Instructor not found', 404);
  }
  return instructor;
}

export async function getInstructorsAdmin(filters) {
  return findInstructorsAdmin(filters);
}

export async function createInstructor(data, actorId = null, ipAddress = null) {
  const newInstructor = await repoCreateInstructor(data);

  await createAuditLog({
    actor_id: actorId,
    action: 'instructor.create',
    entity_type: 'instructor',
    entity_id: newInstructor.id,
    new_value: newInstructor,
    ip_address: ipAddress,
  });

  return newInstructor;
}

export async function updateInstructor(id, data, actorId = null, ipAddress = null) {
  const existing = await findInstructorById(id);
  if (!existing) {
    throw new AppError('Instructor not found', 404);
  }

  const updated = await repoUpdateInstructor(id, data);

  await createAuditLog({
    actor_id: actorId,
    action: 'instructor.update',
    entity_type: 'instructor',
    entity_id: id,
    old_value: existing,
    new_value: updated,
    ip_address: ipAddress,
  });

  return updated;
}

export async function deleteInstructor(id, actorId = null, ipAddress = null) {
  const existing = await findInstructorById(id);
  if (!existing) {
    throw new AppError('Instructor not found', 404);
  }

  await repoDeleteInstructor(id);

  if (existing.user_id) {
    await updateLinkedUserStatus(existing.user_id, 'blocked');
    await revokeUserRefreshTokens(existing.user_id);
  }

  await createAuditLog({
    actor_id: actorId,
    action: 'instructor.deactivate',
    entity_type: 'instructor',
    entity_id: id,
    old_value: existing,
    ip_address: ipAddress,
  });
}

/**
 * Provision an Instructor account and link to users authentication table
 */
export async function provisionInstructor(data, actor = {}, ipAddress = null) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let targetInstructor = null;

    if (data.instructor_id) {
      // 1. Linking an existing marketing instructor profile
      targetInstructor = await findInstructorById(data.instructor_id);
      if (!targetInstructor) {
        throw new AppError('Target instructor profile not found', 404);
      }
      if (targetInstructor.user_id) {
        throw new AppError('This instructor profile is already linked to a user account', 409);
      }
    }

    const normalizedEmail = (data.email || targetInstructor?.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new AppError('Instructor email is required', 400);
    }

    if (!data.instructor_id) {
      // Check if email already used by an instructor
      const existingInstructorByEmail = await findInstructorByEmail(normalizedEmail);
      if (existingInstructorByEmail) {
        throw new AppError('An instructor profile with this email already exists', 409);
      }
    }

    // 2. Check user account by email
    let user = await findUserByNormalizedEmail(normalizedEmail, connection);

    if (user) {
      // Prevent tampering with administrator roles
      if (user.role === 'admin' || user.role === 'super_admin') {
        throw new AppError('Cannot link an existing Administrator account as an instructor', 400);
      }

      // Check if user is already linked to another instructor
      const otherInstructor = await findInstructorByUserId(user.id);
      if (otherInstructor && (!targetInstructor || otherInstructor.id !== targetInstructor.id)) {
        throw new AppError('This user account is already linked to another instructor profile', 409);
      }

      // If user is a student ('user') or counsellor, update their role to 'instructor'
      if (user.role !== 'instructor') {
        await connection.query(
          "UPDATE users SET role = 'instructor', status = 'active' WHERE id = ?",
          [user.id]
        );
        user.role = 'instructor';
      }
    } else {
      // Create new user with role 'instructor'
      const instructorName = data.name || (targetInstructor ? targetInstructor.name : normalizedEmail.split('@')[0]);
      user = await createUserForInstructor(
        {
          name: instructorName,
          email: normalizedEmail,
        },
        connection
      );
    }

    // 3. Create or update instructor profile
    if (!targetInstructor) {
      const socialLinksJson = data.social_links ? JSON.stringify(data.social_links) : null;
      const [instResult] = await connection.query(`
        INSERT INTO instructors (name, designation, experience_years, bio, photo_url, social_links, status, user_id, email)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `, [
        data.name || user.name,
        data.designation || null,
        data.experience_years || null,
        data.bio || null,
        data.photo_url || null,
        socialLinksJson,
        user.id,
        normalizedEmail,
      ]);

      const [newInstRows] = await connection.query('SELECT * FROM instructors WHERE id = ?', [instResult.insertId]);
      targetInstructor = newInstRows[0];
    } else {
      await connection.query(
        'UPDATE instructors SET user_id = ?, email = ?, status = ? WHERE id = ?',
        [user.id, normalizedEmail, 'active', targetInstructor.id]
      );
    }

    await createAuditLog({
      actor_id: actor.id || null,
      action: 'instructor.provision',
      entity_type: 'instructor',
      entity_id: targetInstructor.id,
      new_value: {
        instructor_id: targetInstructor.id,
        user_id: user.id,
        email: normalizedEmail,
        role: 'instructor',
      },
      ip_address: ipAddress,
      connection,
    });

    await connection.commit();
    return findInstructorById(targetInstructor.id);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Toggle instructor account status (active / inactive)
 * Synchronously toggles linked user account (active / blocked)
 */
export async function updateInstructorStatus(id, status, actor = {}, ipAddress = null) {
  const existing = await findInstructorById(id);
  if (!existing) {
    throw new AppError('Instructor not found', 404);
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query('UPDATE instructors SET status = ? WHERE id = ?', [status, id]);

    if (existing.user_id) {
      const userStatus = status === 'active' ? 'active' : 'blocked';
      await updateLinkedUserStatus(existing.user_id, userStatus, connection);

      if (userStatus === 'blocked') {
        await revokeUserRefreshTokens(existing.user_id, connection);
      }
    }

    await createAuditLog({
      actor_id: actor.id || null,
      action: 'instructor.status_update',
      entity_type: 'instructor',
      entity_id: id,
      old_value: { status: existing.status },
      new_value: { status },
      ip_address: ipAddress,
      connection,
    });

    await connection.commit();
    return findInstructorById(id);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Get all assigned instructors for a course
 */
export async function getCourseInstructors(courseId) {
  return findCourseInstructors(courseId);
}

/**
 * Assign instructor to course (supports primary / secondary)
 */
export async function assignInstructorToCourse(courseId, { instructor_id, is_primary = 0, can_manage_curriculum = 1 }, actor = {}, ipAddress = null) {
  const instructor = await findInstructorById(instructor_id);
  if (!instructor) {
    throw new AppError('Instructor not found', 404);
  }
  if (instructor.status !== 'active') {
    throw new AppError('Cannot assign an inactive instructor to a course', 400);
  }

  const result = await repoAssignInstructorToCourse({
    courseId: Number(courseId),
    instructorId: Number(instructor_id),
    isPrimary: Number(is_primary),
    canManageCurriculum: Number(can_manage_curriculum),
  });

  await createAuditLog({
    actor_id: actor.id || null,
    action: 'course_instructor.assign',
    entity_type: 'course',
    entity_id: Number(courseId),
    new_value: { instructor_id, is_primary, can_manage_curriculum },
    ip_address: ipAddress,
  });

  return result;
}

/**
 * Reassign primary instructor for a course
 */
export async function reassignPrimaryInstructor(courseId, newInstructorId, canManageCurriculum = 1, actor = {}, ipAddress = null) {
  const instructor = await findInstructorById(newInstructorId);
  if (!instructor) {
    throw new AppError('Instructor not found', 404);
  }

  const result = await repoReassignPrimaryInstructor(Number(courseId), Number(newInstructorId), canManageCurriculum);

  await createAuditLog({
    actor_id: actor.id || null,
    action: 'course_instructor.reassign_primary',
    entity_type: 'course',
    entity_id: Number(courseId),
    new_value: { primary_instructor_id: newInstructorId },
    ip_address: ipAddress,
  });

  return result;
}

/**
 * Update course instructor assignment (e.g. toggle curriculum permissions)
 */
export async function updateCourseInstructor(courseId, instructorId, updates, actor = {}, ipAddress = null) {
  const result = await repoUpdateCourseInstructor(Number(courseId), Number(instructorId), {
    isPrimary: updates.is_primary,
    canManageCurriculum: updates.can_manage_curriculum,
  });

  await createAuditLog({
    actor_id: actor.id || null,
    action: 'course_instructor.update',
    entity_type: 'course',
    entity_id: Number(courseId),
    new_value: { instructorId, ...updates },
    ip_address: ipAddress,
  });

  return result;
}

/**
 * Remove an instructor from a course
 */
export async function removeInstructorFromCourse(courseId, instructorId, actor = {}, ipAddress = null) {
  await repoRemoveInstructorFromCourse(Number(courseId), Number(instructorId));

  await createAuditLog({
    actor_id: actor.id || null,
    action: 'course_instructor.remove',
    entity_type: 'course',
    entity_id: Number(courseId),
    old_value: { instructorId },
    ip_address: ipAddress,
  });

  return findCourseInstructors(courseId);
}

/**
 * Assign instructor to batch (batch-level override)
 */
export async function assignInstructorToBatch(batchId, instructorId, actor = {}, ipAddress = null) {
  if (instructorId) {
    const instructor = await findInstructorById(instructorId);
    if (!instructor) {
      throw new AppError('Instructor not found', 404);
    }
  }

  const result = await repoAssignInstructorToBatch(Number(batchId), instructorId ? Number(instructorId) : null);

  await createAuditLog({
    actor_id: actor.id || null,
    action: 'batch.instructor_assign',
    entity_type: 'course_batch',
    entity_id: Number(batchId),
    new_value: { instructor_id: instructorId },
    ip_address: ipAddress,
  });

  return result;
}

export default {
  getActiveInstructors,
  getInstructorById,
  findInstructorByUserId,
  getInstructorsAdmin,
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
