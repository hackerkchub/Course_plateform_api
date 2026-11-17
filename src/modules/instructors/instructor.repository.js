import { getPool } from '../../config/db.js';

export async function findActiveInstructors() {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT id, name, designation, experience_years, bio, photo_url, social_links, status
    FROM instructors
    WHERE status = 'active'
    ORDER BY name ASC
  `);
  return rows.map(r => ({
    ...r,
    id: Number(r.id),
    experience_years: r.experience_years !== null ? Number(r.experience_years) : null,
    social_links: typeof r.social_links === 'string' ? JSON.parse(r.social_links) : r.social_links,
  }));
}

export async function findInstructorById(id) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT i.id, i.name, i.designation, i.experience_years, i.bio, i.photo_url, i.social_links, i.status,
           i.user_id, i.email, i.created_at, i.updated_at,
           u.role, u.google_id, u.last_login_at, u.status AS user_status,
           (u.google_id IS NOT NULL) AS google_id_linked
    FROM instructors i
    LEFT JOIN users u ON u.id = i.user_id
    WHERE i.id = ?
  `, [id]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    ...r,
    id: Number(r.id),
    user_id: r.user_id ? Number(r.user_id) : null,
    role: r.role || null,
    experience_years: r.experience_years !== null ? Number(r.experience_years) : null,
    social_links: typeof r.social_links === 'string' ? JSON.parse(r.social_links) : r.social_links,
    google_id_linked: Boolean(r.google_id_linked),
  };
}

export async function findInstructorByUserId(userId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT i.id, i.name, i.designation, i.experience_years, i.bio, i.photo_url, i.social_links, i.status,
           i.user_id, i.email, i.created_at, i.updated_at,
           u.google_id, u.last_login_at, u.status AS user_status,
           (u.google_id IS NOT NULL) AS google_id_linked
    FROM instructors i
    LEFT JOIN users u ON u.id = i.user_id
    WHERE i.user_id = ?
  `, [userId]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    ...r,
    id: Number(r.id),
    user_id: Number(r.user_id),
    experience_years: r.experience_years !== null ? Number(r.experience_years) : null,
    social_links: typeof r.social_links === 'string' ? JSON.parse(r.social_links) : r.social_links,
    google_id_linked: Boolean(r.google_id_linked),
  };
}

export async function findInstructorByEmail(email) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT id, name, designation, status, user_id, email
    FROM instructors
    WHERE LOWER(email) = LOWER(?)
  `, [email]);
  return rows[0] || null;
}

export async function findInstructorsAdmin({ status, search, limit = 20, offset = 0 }) {
  const pool = getPool();
  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    conditions.push('i.status = ?');
    params.push(status);
  }

  if (search) {
    conditions.push('(i.name LIKE ? OR i.designation LIKE ? OR i.bio LIKE ? OR i.email LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM instructors i ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(`
    SELECT i.id, i.name, i.designation, i.experience_years, i.bio, i.photo_url, i.social_links, i.status,
           i.user_id, i.email, i.created_at, i.updated_at,
           u.google_id, u.last_login_at, u.status AS user_status,
           (u.google_id IS NOT NULL) AS google_id_linked,
           (SELECT COUNT(*) FROM course_instructors ci WHERE ci.instructor_id = i.id) AS assigned_courses_count,
           (SELECT COUNT(*) FROM course_batches cb WHERE cb.instructor_id = i.id) AS assigned_batches_count
    FROM instructors i
    LEFT JOIN users u ON u.id = i.user_id
    ${whereClause}
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  return {
    instructors: rows.map(r => ({
      ...r,
      id: Number(r.id),
      user_id: r.user_id ? Number(r.user_id) : null,
      experience_years: r.experience_years !== null ? Number(r.experience_years) : null,
      social_links: typeof r.social_links === 'string' ? JSON.parse(r.social_links) : r.social_links,
      google_id_linked: Boolean(r.google_id_linked),
      assigned_courses_count: Number(r.assigned_courses_count || 0),
      assigned_batches_count: Number(r.assigned_batches_count || 0),
    })),
    total,
  };
}

export async function createInstructor(data) {
  const pool = getPool();
  const socialLinksJson = data.social_links ? JSON.stringify(data.social_links) : null;

  const [result] = await pool.query(`
    INSERT INTO instructors (name, designation, experience_years, bio, photo_url, social_links, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    data.name,
    data.designation || null,
    data.experience_years || null,
    data.bio || null,
    data.photo_url || null,
    socialLinksJson,
    data.status || 'active',
  ]);

  return findInstructorById(result.insertId);
}

export async function updateInstructor(id, data) {
  const pool = getPool();
  const fields = [];
  const params = [];

  const allowed = ['name', 'designation', 'experience_years', 'bio', 'photo_url', 'status'];
  for (const col of allowed) {
    if (data[col] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(data[col]);
    }
  }

  if (data.social_links !== undefined) {
    fields.push('social_links = ?');
    params.push(data.social_links ? JSON.stringify(data.social_links) : null);
  }

  if (fields.length === 0) {
    return findInstructorById(id);
  }

  params.push(id);
  await pool.query(
    `UPDATE instructors SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return findInstructorById(id);
}

export async function deleteInstructor(id) {
  const pool = getPool();
  await pool.query('UPDATE instructors SET status = "inactive" WHERE id = ?', [id]);
}

/**
 * Find user account by normalized email
 */
export async function findUserByNormalizedEmail(email, connection = null) {
  const db = connection || getPool();
  const [rows] = await db.query(
    'SELECT id, name, email, role, status, google_id FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL',
    [(email || '').trim().toLowerCase()]
  );
  return rows[0] || null;
}

/**
 * Create a new user account with role 'instructor'
 */
export async function createUserForInstructor({ name, email, phone = null }, connection = null) {
  const db = connection || getPool();
  const [result] = await db.query(
    `INSERT INTO users (name, email, phone, role, status, email_verified)
     VALUES (?, ?, ?, 'instructor', 'active', 0)`,
    [name.trim(), email.trim().toLowerCase(), phone ? phone.trim() : null]
  );
  return {
    id: Number(result.insertId),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: 'instructor',
    status: 'active',
  };
}

/**
 * Link instructor profile to user account
 */
export async function linkInstructorToUser(instructorId, userId, email, connection = null) {
  const db = connection || getPool();
  await db.query(
    'UPDATE instructors SET user_id = ?, email = ? WHERE id = ?',
    [userId, (email || '').trim().toLowerCase(), instructorId]
  );
  return findInstructorById(instructorId);
}

/**
 * Update user account status (e.g. active / blocked)
 */
export async function updateLinkedUserStatus(userId, status, connection = null) {
  const db = connection || getPool();
  await db.query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
}

/**
 * Revoke all refresh tokens for a user (force session termination)
 */
export async function revokeUserRefreshTokens(userId, connection = null) {
  const db = connection || getPool();
  await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
}

/**
 * Find all instructors assigned to a specific course
 */
export async function findCourseInstructors(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT ci.id, ci.course_id, ci.instructor_id, ci.is_primary, ci.can_manage_curriculum, ci.created_at,
           i.name, i.designation, i.photo_url, i.email, i.status AS instructor_status,
           u.status AS user_status, (u.google_id IS NOT NULL) AS google_id_linked
    FROM course_instructors ci
    JOIN instructors i ON i.id = ci.instructor_id
    LEFT JOIN users u ON u.id = i.user_id
    WHERE ci.course_id = ?
    ORDER BY ci.is_primary DESC, ci.created_at ASC
  `, [courseId]);

  return rows.map(r => ({
    id: Number(r.id),
    course_id: Number(r.course_id),
    instructor_id: Number(r.instructor_id),
    is_primary: Boolean(r.is_primary),
    can_manage_curriculum: Boolean(r.can_manage_curriculum),
    created_at: r.created_at,
    name: r.name,
    designation: r.designation,
    photo_url: r.photo_url,
    email: r.email,
    instructor_status: r.instructor_status,
    user_status: r.user_status,
    google_id_linked: Boolean(r.google_id_linked),
  }));
}

/**
 * Assign instructor to course (handles both primary and secondary assignments)
 * Uses atomic 3-step transaction when setting as primary
 */
export async function assignInstructorToCourse({ courseId, instructorId, isPrimary = 0, canManageCurriculum = 1 }) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (Number(isPrimary) === 1) {
      // Step 1: Demote existing primary instructor
      await connection.query(
        'UPDATE course_instructors SET is_primary = 0 WHERE course_id = ? AND is_primary = 1',
        [courseId]
      );

      // Step 2: Promote or insert new primary instructor
      await connection.query(`
        INSERT INTO course_instructors (course_id, instructor_id, is_primary, can_manage_curriculum)
        VALUES (?, ?, 1, ?)
        ON DUPLICATE KEY UPDATE is_primary = 1, can_manage_curriculum = VALUES(can_manage_curriculum)
      `, [courseId, instructorId, canManageCurriculum ? 1 : 0]);

      // Step 3: Synchronize legacy courses.instructor_id column atomically
      await connection.query(
        'UPDATE courses SET instructor_id = ? WHERE id = ?',
        [instructorId, courseId]
      );
    } else {
      // Secondary assignment
      await connection.query(`
        INSERT INTO course_instructors (course_id, instructor_id, is_primary, can_manage_curriculum)
        VALUES (?, ?, 0, ?)
        ON DUPLICATE KEY UPDATE can_manage_curriculum = VALUES(can_manage_curriculum)
      `, [courseId, instructorId, canManageCurriculum ? 1 : 0]);
    }

    await connection.commit();
    const instructors = await findCourseInstructors(courseId);
    const assigned = instructors.find(i => i.instructor_id === instructorId);
    return {
      ...(assigned || {}),
      course_id: courseId,
      instructor_id: instructorId,
      is_primary: Boolean(isPrimary),
      can_manage_curriculum: Boolean(canManageCurriculum),
      instructors,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Reassign primary instructor for a course atomically
 */
export async function reassignPrimaryInstructor(courseId, newInstructorId, canManageCurriculum = 1) {
  return assignInstructorToCourse({
    courseId,
    instructorId: newInstructorId,
    isPrimary: 1,
    canManageCurriculum,
  });
}

/**
 * Update assignment properties (e.g. toggle can_manage_curriculum or primary status)
 */
export async function updateCourseInstructor(courseId, instructorId, { isPrimary, canManageCurriculum }) {
  if (isPrimary !== undefined && Number(isPrimary) === 1) {
    return assignInstructorToCourse({
      courseId,
      instructorId,
      isPrimary: 1,
      canManageCurriculum: canManageCurriculum !== undefined ? canManageCurriculum : 1,
    });
  }

  const pool = getPool();
  const fields = [];
  const params = [];

  if (canManageCurriculum !== undefined) {
    fields.push('can_manage_curriculum = ?');
    params.push(canManageCurriculum ? 1 : 0);
  }

  if (isPrimary !== undefined && Number(isPrimary) === 0) {
    fields.push('is_primary = 0');
  }

  if (fields.length > 0) {
    params.push(courseId, instructorId);
    await pool.query(
      `UPDATE course_instructors SET ${fields.join(', ')} WHERE course_id = ? AND instructor_id = ?`,
      params
    );
  }

  return findCourseInstructors(courseId);
}

/**
 * Remove an instructor from a course
 */
export async function removeInstructorFromCourse(courseId, instructorId) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      'SELECT is_primary FROM course_instructors WHERE course_id = ? AND instructor_id = ?',
      [courseId, instructorId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return;
    }

    const wasPrimary = Boolean(rows[0].is_primary);

    await connection.query(
      'DELETE FROM course_instructors WHERE course_id = ? AND instructor_id = ?',
      [courseId, instructorId]
    );

    if (wasPrimary) {
      // If was primary, select the next available instructor or NULL
      const [remaining] = await connection.query(
        'SELECT instructor_id FROM course_instructors WHERE course_id = ? ORDER BY created_at ASC LIMIT 1',
        [courseId]
      );

      const nextInstructorId = remaining[0]?.instructor_id || null;

      if (nextInstructorId) {
        await connection.query(
          'UPDATE course_instructors SET is_primary = 1 WHERE course_id = ? AND instructor_id = ?',
          [courseId, nextInstructorId]
        );
      }

      await connection.query(
        'UPDATE courses SET instructor_id = ? WHERE id = ?',
        [nextInstructorId, courseId]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Assign instructor to batch (batch-level override)
 */
export async function assignInstructorToBatch(batchId, instructorId) {
  const pool = getPool();
  await pool.query(
    'UPDATE course_batches SET instructor_id = ? WHERE id = ?',
    [instructorId || null, batchId]
  );
  const [rows] = await pool.query('SELECT id, course_id, batch_name, instructor_id FROM course_batches WHERE id = ?', [batchId]);
  return rows[0] || null;
}

export default {
  findActiveInstructors,
  findInstructorById,
  findInstructorByUserId,
  findInstructorByEmail,
  findInstructorsAdmin,
  createInstructor,
  updateInstructor,
  deleteInstructor,
  findUserByNormalizedEmail,
  createUserForInstructor,
  linkInstructorToUser,
  updateLinkedUserStatus,
  revokeUserRefreshTokens,
  findCourseInstructors,
  assignInstructorToCourse,
  reassignPrimaryInstructor,
  updateCourseInstructor,
  removeInstructorFromCourse,
  assignInstructorToBatch,
};
