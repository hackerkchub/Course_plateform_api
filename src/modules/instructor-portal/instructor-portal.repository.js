import { getPool } from '../../config/db.js';

/**
 * Resolve instructor record linked to the authenticated user ID
 */
export async function resolveInstructorByUserId(userId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT i.id, i.name, i.designation, i.experience_years, i.bio, i.photo_url, i.social_links, i.status,
            i.user_id, i.email, i.created_at, i.updated_at,
            u.role, u.status AS user_status
     FROM instructors i
     JOIN users u ON u.id = i.user_id
     WHERE i.user_id = ? AND i.status = 'active' AND u.status = 'active'`,
    [userId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    ...r,
    id: Number(r.id),
    user_id: Number(r.user_id),
    experience_years: r.experience_years !== null ? Number(r.experience_years) : null,
    social_links: typeof r.social_links === 'string' ? JSON.parse(r.social_links) : r.social_links,
  };
}

/**
 * Check if instructor is assigned to course and return permission flags
 */
export async function checkCourseAssignment(instructorId, courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT is_primary, can_manage_curriculum FROM course_instructors WHERE course_id = ? AND instructor_id = ?',
    [courseId, instructorId]
  );
  if (rows.length === 0) {
    return { isAssigned: false, isPrimary: false, canManageCurriculum: false };
  }
  return {
    isAssigned: true,
    isPrimary: Boolean(rows[0].is_primary),
    canManageCurriculum: Boolean(rows[0].can_manage_curriculum),
  };
}

/**
 * Check if instructor is assigned to batch (either directly or via course assignment)
 */
export async function checkBatchAssignment(instructorId, batchId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT cb.id, cb.course_id, cb.instructor_id AS batch_instructor_id,
           ci.instructor_id AS course_instructor_id
    FROM course_batches cb
    LEFT JOIN course_instructors ci ON ci.course_id = cb.course_id AND ci.instructor_id = ?
    WHERE cb.id = ? AND (cb.instructor_id = ? OR ci.instructor_id = ?)
  `, [instructorId, batchId, instructorId, instructorId]);

  return rows.length > 0;
}

/**
 * Retrieve overview dashboard statistics for instructor
 */
export async function getInstructorDashboardMetrics(instructorId) {
  const pool = getPool();

  // 1. Assigned courses count
  const [[{ coursesCount }]] = await pool.query(
    'SELECT COUNT(*) AS coursesCount FROM course_instructors WHERE instructor_id = ?',
    [instructorId]
  );

  // 2. Assigned batches count
  const [[{ batchesCount }]] = await pool.query(`
    SELECT COUNT(DISTINCT cb.id) AS batchesCount
    FROM course_batches cb
    LEFT JOIN course_instructors ci ON ci.course_id = cb.course_id AND ci.instructor_id = ?
    WHERE cb.instructor_id = ? OR ci.instructor_id = ?
  `, [instructorId, instructorId, instructorId]);

  // 3. Total distinct students enrolled in instructor's courses/batches
  const [[{ studentsCount }]] = await pool.query(`
    SELECT COUNT(DISTINCT ce.user_id) AS studentsCount
    FROM course_enrollments ce
    JOIN course_instructors ci ON ci.course_id = ce.course_id
    WHERE ci.instructor_id = ? AND ce.enrollment_status IN ('active', 'completed')
  `, [instructorId]);

  // 4. Upcoming sessions count & list
  const [upcomingSessions] = await pool.query(`
    SELECT bs.id, bs.batch_id, bs.session_number, bs.session_date, bs.start_time, bs.end_time, bs.title, bs.status,
           cb.batch_name, c.course_name
    FROM batch_sessions bs
    JOIN course_batches cb ON cb.id = bs.batch_id
    JOIN courses c ON c.id = cb.course_id
    LEFT JOIN course_instructors ci ON ci.course_id = c.id AND ci.instructor_id = ?
    WHERE (bs.instructor_id = ? OR (bs.instructor_id IS NULL AND (cb.instructor_id = ? OR ci.instructor_id = ?)))
      AND bs.session_date >= CURDATE()
      AND bs.status = 'scheduled'
    ORDER BY bs.session_date ASC, bs.start_time ASC
    LIMIT 5
  `, [instructorId, instructorId, instructorId, instructorId]);

  // 5. Pending demo requests count & list
  const [pendingDemos] = await pool.query(`
    SELECT dr.id, dr.student_name, dr.email AS student_email, dr.phone AS student_phone, dr.status,
           dr.preferred_date AS demo_date, dr.preferred_time AS demo_time,
           dr.created_at, c.course_name
    FROM demo_requests dr
    JOIN courses c ON c.id = dr.course_id
    JOIN course_instructors ci ON ci.course_id = c.id
    WHERE ci.instructor_id = ? AND dr.status = 'pending'
    ORDER BY dr.created_at DESC
    LIMIT 5
  `, [instructorId]);

  const [[{ demosCount }]] = await pool.query(`
    SELECT COUNT(*) AS demosCount
    FROM demo_requests dr
    JOIN course_instructors ci ON ci.course_id = dr.course_id
    WHERE ci.instructor_id = ? AND dr.status = 'pending'
  `, [instructorId]);

  return {
    assignedCoursesCount: Number(coursesCount || 0),
    assignedBatchesCount: Number(batchesCount || 0),
    totalStudentsCount: Number(studentsCount || 0),
    pendingDemosCount: Number(demosCount || 0),
    upcomingSessionsCount: upcomingSessions.length,
    upcomingSessions: upcomingSessions.map(s => ({
      ...s,
      id: Number(s.id),
      batch_id: Number(s.batch_id),
      session_number: Number(s.session_number),
    })),
    pendingDemos: pendingDemos.map(d => ({
      ...d,
      id: Number(d.id),
    })),
  };
}

/**
 * Retrieve courses assigned to this instructor
 */
export async function getInstructorCourses(instructorId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT c.id, c.course_code, c.course_name, c.slug, c.course_level, c.mode, c.status,
           c.duration_hours, c.total_modules, c.total_lessons, c.price, c.thumbnail_url,
           ci.is_primary, ci.can_manage_curriculum, ci.created_at AS assigned_at,
           (SELECT COUNT(*) FROM course_batches cb WHERE cb.course_id = c.id) AS batch_count,
           (SELECT COUNT(*) FROM course_enrollments ce WHERE ce.course_id = c.id AND ce.enrollment_status IN ('active', 'completed')) AS enrolled_students_count
    FROM course_instructors ci
    JOIN courses c ON c.id = ci.course_id
    WHERE ci.instructor_id = ?
    ORDER BY ci.is_primary DESC, c.course_name ASC
  `, [instructorId]);

  return rows.map(r => ({
    ...r,
    id: Number(r.id),
    is_primary: Boolean(r.is_primary),
    can_manage_curriculum: Boolean(r.can_manage_curriculum),
    batch_count: Number(r.batch_count || 0),
    enrolled_students_count: Number(r.enrolled_students_count || 0),
  }));
}

/**
 * Retrieve detailed course view for assigned instructor
 */
export async function getInstructorCourseById(instructorId, courseId) {
  const pool = getPool();
  const [courseRows] = await pool.query(`
    SELECT c.*, ci.is_primary, ci.can_manage_curriculum, ci.created_at AS assigned_at
    FROM course_instructors ci
    JOIN courses c ON c.id = ci.course_id
    WHERE ci.instructor_id = ? AND c.id = ?
  `, [instructorId, courseId]);

  if (courseRows.length === 0) return null;
  const course = courseRows[0];

  // Fetch modules & lessons
  const [modules] = await pool.query(`
    SELECT id, course_id, title, description, display_order
    FROM course_modules
    WHERE course_id = ?
    ORDER BY display_order ASC, id ASC
  `, [courseId]);

  for (const mod of modules) {
    const [lessons] = await pool.query(`
      SELECT id, module_id, title, description, duration_minutes, is_free_preview, display_order
      FROM course_lessons
      WHERE module_id = ?
      ORDER BY display_order ASC, id ASC
    `, [mod.id]);
    mod.lessons = lessons.map(l => ({
      ...l,
      id: Number(l.id),
      is_free_preview: Boolean(l.is_free_preview),
    }));
  }

  // Fetch batches
  const [batches] = await pool.query(`
    SELECT id, course_id, batch_name, start_date, end_date, class_days, class_timing,
           total_seats, seats_available, status, instructor_id
    FROM course_batches
    WHERE course_id = ?
    ORDER BY start_date DESC
  `, [courseId]);

  return {
    ...course,
    id: Number(course.id),
    is_primary: Boolean(course.is_primary),
    can_manage_curriculum: Boolean(course.can_manage_curriculum),
    modules,
    batches: batches.map(b => ({
      ...b,
      id: Number(b.id),
      instructor_id: b.instructor_id ? Number(b.instructor_id) : null,
    })),
  };
}

/**
 * Retrieve batches assigned to this instructor
 */
export async function getInstructorBatches(instructorId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT cb.id, cb.course_id, cb.batch_name, cb.start_date, cb.end_date, cb.class_days, cb.class_timing,
           cb.total_seats, cb.seats_available, cb.status, cb.instructor_id AS batch_instructor_id,
           c.course_name, c.course_code,
           ci.is_primary AS is_course_primary,
           (SELECT COUNT(*) FROM batch_sessions bs WHERE bs.batch_id = cb.id) AS total_sessions,
           (SELECT COUNT(*) FROM batch_sessions bs WHERE bs.batch_id = cb.id AND bs.status = 'conducted') AS conducted_sessions,
           (SELECT COUNT(*) FROM course_enrollments ce WHERE ce.course_id = cb.course_id AND ce.enrollment_status IN ('active', 'completed')) AS enrolled_count
    FROM course_batches cb
    JOIN courses c ON c.id = cb.course_id
    LEFT JOIN course_instructors ci ON ci.course_id = c.id AND ci.instructor_id = ?
    WHERE cb.instructor_id = ? OR ci.instructor_id = ?
    ORDER BY cb.start_date DESC
  `, [instructorId, instructorId, instructorId]);

  return rows.map(r => ({
    ...r,
    id: Number(r.id),
    course_id: Number(r.course_id),
    batch_instructor_id: r.batch_instructor_id ? Number(r.batch_instructor_id) : null,
    is_course_primary: Boolean(r.is_course_primary),
    total_sessions: Number(r.total_sessions || 0),
    conducted_sessions: Number(r.conducted_sessions || 0),
    enrolled_count: Number(r.enrolled_count || 0),
  }));
}

/**
 * Retrieve enrolled students for instructor's courses/batches
 */
export async function getInstructorStudents(instructorId, { courseId, batchId, search, limit = 25, offset = 0 }) {
  const pool = getPool();
  const conditions = [
    "ci.instructor_id = ?",
    "ce.enrollment_status IN ('active', 'completed')"
  ];
  const params = [instructorId];

  if (courseId) {
    conditions.push('ce.course_id = ?');
    params.push(courseId);
  }

  if (search) {
    conditions.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [countRows] = await pool.query(`
    SELECT COUNT(DISTINCT ce.user_id) AS total
    FROM course_enrollments ce
    JOIN courses c ON c.id = ce.course_id
    JOIN course_instructors ci ON ci.course_id = c.id
    JOIN users u ON u.id = ce.user_id
    ${whereClause}
  `, params);

  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(`
    SELECT u.id AS student_id, u.name AS student_name, u.email AS student_email, u.phone AS student_phone,
           ce.id AS enrollment_id, ce.course_id, ce.enrollment_status, ce.created_at AS enrolled_at,
           c.course_name, c.course_code,
           (
             SELECT COUNT(DISTINCT lp.lesson_id)
             FROM lesson_progress lp
             JOIN course_lessons cl ON cl.id = lp.lesson_id
             JOIN course_modules cm ON cm.id = cl.module_id
             WHERE cm.course_id = c.id
               AND lp.user_id = u.id
               AND lp.completed = 1
           ) AS completed_lessons_count,
           (SELECT COUNT(*) FROM batch_attendance ba WHERE ba.student_id = u.id AND ba.status = 'present') AS attended_sessions_count
    FROM course_enrollments ce
    JOIN courses c ON c.id = ce.course_id
    JOIN course_instructors ci ON ci.course_id = c.id
    JOIN users u ON u.id = ce.user_id
    ${whereClause}
    ORDER BY ce.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  return {
    students: rows.map(r => ({
      ...r,
      student_id: Number(r.student_id),
      enrollment_id: Number(r.enrollment_id),
      course_id: Number(r.course_id),
      completed_lessons_count: Number(r.completed_lessons_count || 0),
      attended_sessions_count: Number(r.attended_sessions_count || 0),
    })),
    total,
  };
}

/**
 * Retrieve demo requests for courses taught by instructor
 */
export async function getInstructorDemos(instructorId, { status, limit = 20, offset = 0 }) {
  const pool = getPool();
  const conditions = ['ci.instructor_id = ?'];
  const params = [instructorId];

  if (status && status !== 'all') {
    conditions.push('dr.status = ?');
    params.push(status);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [countRows] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM demo_requests dr
    JOIN courses c ON c.id = dr.course_id
    JOIN course_instructors ci ON ci.course_id = c.id
    ${whereClause}
  `, params);

  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(`
    SELECT dr.id, dr.course_id, dr.student_name, dr.email AS student_email, dr.phone AS student_phone, dr.status,
           dr.preferred_demo_type AS preferred_mode, dr.preferred_date AS demo_date, dr.preferred_time AS demo_time,
           dr.admin_notes AS notes, dr.created_at, dr.updated_at,
           c.course_name, c.course_code
    FROM demo_requests dr
    JOIN courses c ON c.id = dr.course_id
    JOIN course_instructors ci ON ci.course_id = c.id
    ${whereClause}
    ORDER BY dr.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  return {
    demos: rows.map(r => ({
      ...r,
      id: Number(r.id),
      course_id: Number(r.course_id),
    })),
    total,
  };
}

/**
 * Update demo request status / notes by instructor
 */
export async function updateDemoRequest(instructorId, demoId, { status, notes }) {
  const pool = getPool();

  // Verify instructor owns this course demo
  const [rows] = await pool.query(`
    SELECT dr.id, dr.status, dr.notes
    FROM demo_requests dr
    JOIN course_instructors ci ON ci.course_id = dr.course_id
    WHERE dr.id = ? AND ci.instructor_id = ?
  `, [demoId, instructorId]);

  if (rows.length === 0) return null;

  const fields = [];
  const params = [];

  if (status) {
    fields.push('status = ?');
    params.push(status);
  }
  if (notes !== undefined) {
    fields.push('notes = ?');
    params.push(notes);
  }

  if (fields.length > 0) {
    params.push(demoId);
    await pool.query(`UPDATE demo_requests SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  const [updated] = await pool.query('SELECT * FROM demo_requests WHERE id = ?', [demoId]);
  return updated[0] || null;
}

/**
 * Retrieve batch sessions for assigned batches
 */
export async function getInstructorSessions(instructorId, { batchId, dateFrom, dateTo }) {
  const pool = getPool();
  const conditions = [
    '(bs.instructor_id = ? OR (bs.instructor_id IS NULL AND (cb.instructor_id = ? OR ci.instructor_id = ?)))'
  ];
  const params = [instructorId, instructorId, instructorId];

  if (batchId) {
    conditions.push('bs.batch_id = ?');
    params.push(batchId);
  }
  if (dateFrom) {
    conditions.push('bs.session_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('bs.session_date <= ?');
    params.push(dateTo);
  }

  const [rows] = await pool.query(`
    SELECT bs.id, bs.batch_id, bs.session_number, bs.session_date, bs.start_time, bs.end_time,
           bs.title, bs.instructor_id, bs.status, bs.created_at, bs.updated_at,
           cb.batch_name, c.course_name,
           (SELECT COUNT(*) FROM batch_attendance ba WHERE ba.session_id = bs.id) AS attendance_marked_count
    FROM batch_sessions bs
    JOIN course_batches cb ON cb.id = bs.batch_id
    JOIN courses c ON c.id = cb.course_id
    LEFT JOIN course_instructors ci ON ci.course_id = c.id AND ci.instructor_id = ?
    WHERE ${conditions.join(' AND ')}
    ORDER BY bs.session_date ASC, bs.start_time ASC
  `, [instructorId, ...params]);

  return rows.map(r => ({
    ...r,
    id: Number(r.id),
    batch_id: Number(r.batch_id),
    session_number: Number(r.session_number),
    attendance_marked_count: Number(r.attendance_marked_count || 0),
  }));
}

/**
 * Create a new batch session
 */
export async function createSession(instructorId, data) {
  const pool = getPool();

  const [result] = await pool.query(`
    INSERT INTO batch_sessions (batch_id, session_number, session_date, start_time, end_time, title, instructor_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    data.batch_id,
    data.session_number,
    data.session_date,
    data.start_time || null,
    data.end_time || null,
    data.title || null,
    instructorId,
    data.status || 'scheduled',
  ]);

  const [rows] = await pool.query('SELECT * FROM batch_sessions WHERE id = ?', [result.insertId]);
  return rows[0];
}

/**
 * Update an existing batch session
 */
export async function updateSession(instructorId, sessionId, data) {
  const pool = getPool();
  const fields = [];
  const params = [];

  const allowed = ['session_date', 'start_time', 'end_time', 'title', 'status'];
  for (const col of allowed) {
    if (data[col] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(data[col]);
    }
  }

  if (fields.length === 0) return null;

  params.push(sessionId);
  await pool.query(`UPDATE batch_sessions SET ${fields.join(', ')} WHERE id = ?`, params);

  const [rows] = await pool.query('SELECT * FROM batch_sessions WHERE id = ?', [sessionId]);
  return rows[0] || null;
}

/**
 * Get enrolled students and attendance status for a session
 */
export async function getSessionAttendance(sessionId) {
  const pool = getPool();

  const [sessionRows] = await pool.query(`
    SELECT bs.*, cb.batch_name, cb.course_id, c.course_name
    FROM batch_sessions bs
    JOIN course_batches cb ON cb.id = bs.batch_id
    JOIN courses c ON c.id = cb.course_id
    WHERE bs.id = ?
  `, [sessionId]);

  if (sessionRows.length === 0) return null;
  const session = sessionRows[0];

  // Enrolled students for this batch/course
  const [students] = await pool.query(`
    SELECT u.id AS student_id, u.name AS student_name, u.email AS student_email,
           ba.id AS attendance_id, ba.status AS attendance_status, ba.notes, ba.marked_by, ba.updated_at AS marked_at
    FROM course_enrollments ce
    JOIN users u ON u.id = ce.user_id
    LEFT JOIN batch_attendance ba ON ba.session_id = ? AND ba.student_id = u.id
    WHERE ce.course_id = ? AND ce.enrollment_status IN ('active', 'completed')
    ORDER BY u.name ASC
  `, [sessionId, session.course_id]);

  return {
    session: {
      ...session,
      id: Number(session.id),
      batch_id: Number(session.batch_id),
    },
    students: students.map(s => ({
      ...s,
      student_id: Number(s.student_id),
      attendance_id: s.attendance_id ? Number(s.attendance_id) : null,
      attendance_status: s.attendance_status || null,
    })),
  };
}

/**
 * Save/update attendance records for a session
 */
export async function saveSessionAttendance(sessionId, records, markedBy) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const rec of records) {
      await connection.query(`
        INSERT INTO batch_attendance (session_id, student_id, status, notes, marked_by)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes), marked_by = VALUES(marked_by)
      `, [
        sessionId,
        rec.student_id,
        rec.status,
        rec.notes || null,
        markedBy,
      ]);
    }

    await connection.commit();
    return getSessionAttendance(sessionId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Get study materials for instructor's courses
 */
export async function getInstructorMaterials(instructorId, { courseId }) {
  const pool = getPool();
  const conditions = ['ci.instructor_id = ?'];
  const params = [instructorId];

  if (courseId) {
    conditions.push('cm.course_id = ?');
    params.push(courseId);
  }

  const [rows] = await pool.query(`
    SELECT cm.id, cm.course_id, cm.title, cm.material_type, cm.file_path, cm.file_path AS file_url,
           cm.file_type, cm.file_size_bytes, cm.file_size_bytes AS file_size, cm.is_preview,
           cm.requires_enrollment, cm.display_order, cm.uploaded_by,
           cm.created_at, c.course_name, c.course_code
    FROM course_materials cm
    JOIN courses c ON c.id = cm.course_id
    JOIN course_instructors ci ON ci.course_id = c.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY cm.created_at DESC
  `, params);

  return rows.map(r => ({
    ...r,
    id: Number(r.id),
    course_id: Number(r.course_id),
    file_size_bytes: Number(r.file_size_bytes || 0),
    is_preview: Boolean(r.is_preview),
    requires_enrollment: Boolean(r.requires_enrollment),
  }));
}

/**
 * Add study material for an assigned course
 */
export async function createMaterial(instructorId, userId, data) {
  const pool = getPool();
  const [result] = await pool.query(`
    INSERT INTO course_materials (course_id, title, material_type, file_path, file_type, file_size_bytes, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    data.course_id,
    data.title,
    data.material_type || 'notes',
    data.file_path,
    data.file_type || null,
    data.file_size_bytes || 0,
    userId,
  ]);

  const [rows] = await pool.query('SELECT * FROM course_materials WHERE id = ?', [result.insertId]);
  return rows[0];
}

/**
 * Delete study material
 */
export async function deleteMaterial(instructorId, materialId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT cm.id
    FROM course_materials cm
    JOIN course_instructors ci ON ci.course_id = cm.course_id
    WHERE cm.id = ? AND ci.instructor_id = ?
  `, [materialId, instructorId]);

  if (rows.length === 0) return false;

  await pool.query('DELETE FROM course_materials WHERE id = ?', [materialId]);
  return true;
}

/**
 * Curriculum: Create module in course
 */
export async function createModule(courseId, data) {
  const pool = getPool();
  const [result] = await pool.query(`
    INSERT INTO course_modules (course_id, title, description, display_order)
    VALUES (?, ?, ?, ?)
  `, [courseId, data.title, data.description || null, data.display_order || 0]);

  const [rows] = await pool.query('SELECT * FROM course_modules WHERE id = ?', [result.insertId]);
  return rows[0];
}

/**
 * Curriculum: Update module
 */
export async function updateModule(moduleId, data) {
  const pool = getPool();
  const fields = [];
  const params = [];

  const allowed = ['title', 'description', 'display_order', 'is_published'];
  for (const col of allowed) {
    if (data[col] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(data[col]);
    }
  }

  if (fields.length === 0) return null;
  params.push(moduleId);
  await pool.query(`UPDATE course_modules SET ${fields.join(', ')} WHERE id = ?`, params);

  const [rows] = await pool.query('SELECT * FROM course_modules WHERE id = ?', [moduleId]);
  return rows[0] || null;
}

/**
 * Curriculum: Delete module
 */
export async function deleteModule(moduleId) {
  const pool = getPool();
  // Delete associated lessons first
  await pool.query('DELETE FROM course_lessons WHERE module_id = ?', [moduleId]);
  const [result] = await pool.query('DELETE FROM course_modules WHERE id = ?', [moduleId]);
  return result.affectedRows > 0;
}

/**
 * Curriculum: Create lesson in module
 */
export async function createLesson(moduleId, data) {
  const pool = getPool();
  const duration = data.duration_seconds !== undefined ? data.duration_seconds : (data.duration_minutes ? data.duration_minutes * 60 : 0);

  const [result] = await pool.query(`
    INSERT INTO course_lessons (module_id, title, description, lesson_type, content_url, duration_seconds, is_preview, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    moduleId,
    data.title,
    data.description || null,
    data.lesson_type || 'video',
    data.content_url || null,
    duration,
    data.is_preview ? 1 : 0,
    data.display_order || 0,
  ]);

  const [rows] = await pool.query('SELECT * FROM course_lessons WHERE id = ?', [result.insertId]);
  return rows[0];
}

/**
 * Curriculum: Update lesson
 */
export async function updateLesson(lessonId, data) {
  const pool = getPool();
  const fields = [];
  const params = [];

  const allowed = ['title', 'description', 'lesson_type', 'content_url', 'is_preview', 'is_published', 'display_order'];
  for (const col of allowed) {
    if (data[col] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(data[col]);
    }
  }

  if (data.duration_seconds !== undefined) {
    fields.push('duration_seconds = ?');
    params.push(data.duration_seconds);
  } else if (data.duration_minutes !== undefined) {
    fields.push('duration_seconds = ?');
    params.push(data.duration_minutes * 60);
  }

  if (fields.length === 0) return null;
  params.push(lessonId);
  await pool.query(`UPDATE course_lessons SET ${fields.join(', ')} WHERE id = ?`, params);

  const [rows] = await pool.query('SELECT * FROM course_lessons WHERE id = ?', [lessonId]);
  return rows[0] || null;
}

/**
 * Curriculum: Delete lesson
 */
export async function deleteLesson(lessonId) {
  const pool = getPool();
  const [result] = await pool.query('DELETE FROM course_lessons WHERE id = ?', [lessonId]);
  return result.affectedRows > 0;
}

/**
 * Find module by ID with course info
 */
export async function findModuleWithCourse(moduleId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT cm.*, c.id AS course_id, c.course_name
    FROM course_modules cm
    JOIN courses c ON c.id = cm.course_id
    WHERE cm.id = ?
  `, [moduleId]);
  return rows[0] || null;
}

/**
 * Find lesson by ID with course info
 */
export async function findLessonWithCourse(lessonId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT cl.*, cm.course_id
    FROM course_lessons cl
    JOIN course_modules cm ON cm.id = cl.module_id
    WHERE cl.id = ?
  `, [lessonId]);
  return rows[0] || null;
}

/**
 * Update instructor profile details (bio, designation, social_links)
 */
export async function updateInstructorProfile(instructorId, data) {
  const pool = getPool();
  const fields = [];
  const params = [];

  const allowed = ['designation', 'experience_years', 'bio', 'photo_url'];
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

  if (fields.length > 0) {
    params.push(instructorId);
    await pool.query(`UPDATE instructors SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  const [rows] = await pool.query('SELECT * FROM instructors WHERE id = ?', [instructorId]);
  return rows[0] || null;
}

export default {
  resolveInstructorByUserId,
  checkCourseAssignment,
  checkBatchAssignment,
  getInstructorDashboardMetrics,
  getInstructorCourses,
  getInstructorCourseById,
  getInstructorBatches,
  getInstructorStudents,
  getInstructorDemos,
  updateDemoRequest,
  getInstructorSessions,
  createSession,
  updateSession,
  getSessionAttendance,
  saveSessionAttendance,
  getInstructorMaterials,
  createMaterial,
  deleteMaterial,
  createModule,
  updateModule,
  deleteModule,
  createLesson,
  updateLesson,
  deleteLesson,
  findModuleWithCourse,
  findLessonWithCourse,
  updateInstructorProfile,
};
