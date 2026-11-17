import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import { generateAccessToken } from '../src/utils/token.js';
import { emitNotificationEvent } from '../src/modules/notifications/notification.events.js';
import { runWorkerIteration } from '../src/modules/notifications/notification.worker.js';
import * as notifRepo from '../src/modules/notifications/notification.repository.js';

describe('Phase 2C - Instructor Management, Portal & Notifications Integration Tests', () => {
  const pool = getPool();
  const testRunId = Date.now();
  const cleanupUserEmails = [];
  const cleanupInstructorIds = [];
  const cleanupCourseIds = [];
  const cleanupBatchIds = [];
  const cleanupPhones = [];

  let adminUser = null;
  let adminToken = null;
  let studentUser = null;
  let studentToken = null;
  let instructorUser = null;
  let instructorToken = null;
  let testInstructorRecord = null;
  let testCourse = null;
  let testBatch = null;

  before(async () => {
    // 1. Verify DB
    const [dbCheck] = await pool.query('SELECT DATABASE() as current_db');
    assert.strictEqual(dbCheck[0]?.current_db, 'course_platform_db');

    // 2. Admin User
    const adminEmail = `admin_phase2c_${testRunId}@test.com`;
    cleanupUserEmails.push(adminEmail);
    const [resAdmin] = await pool.query(
      "INSERT INTO users (name, email, role, status, email_verified) VALUES ('Admin 2C', ?, 'admin', 'active', TRUE)",
      [adminEmail]
    );
    adminUser = { id: resAdmin.insertId, email: adminEmail, role: 'admin' };
    adminToken = generateAccessToken(adminUser);

    // 3. Student User
    const studentEmail = `student_phase2c_${testRunId}@test.com`;
    cleanupUserEmails.push(studentEmail);
    const [resStudent] = await pool.query(
      "INSERT INTO users (name, email, role, status, email_verified, phone) VALUES ('Student 2C', ?, 'user', 'active', TRUE, '+919876543210')",
      [studentEmail]
    );
    studentUser = { id: resStudent.insertId, email: studentEmail, role: 'user' };
    studentToken = generateAccessToken(studentUser);

    // 4. Test Course
    const courseCode = `P2C-${testRunId.toString().slice(-6)}`;
    const [resCourse] = await pool.query(`
      INSERT INTO courses (category_id, subcategory_id, course_code, course_name, slug, short_description, description, course_level, language, mode, price, status)
      VALUES (422, 338, ?, 'Phase 2C Test Course', ?, 'Short description for test course', 'Full description here', 'beginner', 'English', 'online', 4999.00, 'published')
    `, [courseCode, `p2c-test-${testRunId}`]);
    testCourse = { id: resCourse.insertId, course_code: courseCode };
    cleanupCourseIds.push(testCourse.id);

    // 5. Test Batch
    const [resBatch] = await pool.query(`
      INSERT INTO course_batches (course_id, batch_name, start_date, class_days, class_timing, total_seats, seats_available, status)
      VALUES (?, 'P2C Batch 1', CURDATE(), 'Mon,Wed,Fri', '10:00 - 12:00', 30, 30, 'open')
    `, [testCourse.id]);
    testBatch = { id: resBatch.insertId };
    cleanupBatchIds.push(testBatch.id);

    // 6. Test Instructor (CMS profile)
    const instEmail = `instructor_p2c_${testRunId}@test.com`;
    cleanupUserEmails.push(instEmail);
    const [resInst] = await pool.query(`
      INSERT INTO instructors (name, designation, email, status)
      VALUES ('Prof. Alan Turing', 'Senior AI Scientist', ?, 'active')
    `, [instEmail]);
    testInstructorRecord = { id: resInst.insertId, email: instEmail };
    cleanupInstructorIds.push(testInstructorRecord.id);
  });

  after(async () => {
    // Cleanup generated data
    try {
      if (cleanupBatchIds.length > 0) {
        await pool.query(`DELETE FROM batch_attendance WHERE session_id IN (SELECT id FROM batch_sessions WHERE batch_id IN (?))`, [cleanupBatchIds]);
        await pool.query(`DELETE FROM batch_sessions WHERE batch_id IN (?)`, [cleanupBatchIds]);
        await pool.query(`DELETE FROM course_batches WHERE id IN (?)`, [cleanupBatchIds]);
      }
      if (cleanupCourseIds.length > 0) {
        await pool.query(`DELETE FROM course_instructors WHERE course_id IN (?)`, [cleanupCourseIds]);
        await pool.query(`DELETE FROM course_materials WHERE course_id IN (?)`, [cleanupCourseIds]);
        if (cleanupUserEmails.length > 0) {
          await pool.query(`DELETE FROM lesson_progress WHERE user_id IN (SELECT id FROM users WHERE email IN (?))`, [cleanupUserEmails]);
        }
        await pool.query(`DELETE FROM course_lessons WHERE module_id IN (SELECT id FROM course_modules WHERE course_id IN (?))`, [cleanupCourseIds]);
        await pool.query(`DELETE FROM course_modules WHERE course_id IN (?)`, [cleanupCourseIds]);
        await pool.query(`DELETE FROM course_enrollments WHERE course_id IN (?)`, [cleanupCourseIds]);
        await pool.query(`DELETE FROM demo_requests WHERE course_id IN (?)`, [cleanupCourseIds]);
        await pool.query(`DELETE FROM courses WHERE id IN (?)`, [cleanupCourseIds]);
      }
      if (cleanupInstructorIds.length > 0) {
        await pool.query(`DELETE FROM instructors WHERE id IN (?)`, [cleanupInstructorIds]);
      }
      if (cleanupUserEmails.length > 0) {
        await pool.query(`DELETE FROM users WHERE email IN (?)`, [cleanupUserEmails]);
      }
      if (cleanupPhones.length > 0) {
        await pool.query(`DELETE FROM whatsapp_consents WHERE phone IN (?)`, [cleanupPhones]);
      }
    } catch (err) {
      console.error('Error during cleanup:', err.message);
    } finally {
      await pool.end();
    }
  });

  // MODULE 1: ADMIN INSTRUCTOR PROVISIONING & ASSIGNMENTS
  describe('Module 1: Admin Instructor Provisioning & Assignments', () => {
    it('1.1 Admin provisions login identity for unlinked instructor', async () => {
      const res = await request(app)
        .post(`/api/admin/instructors/${testInstructorRecord.id}/provision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          password: 'SecurePassword123!',
          phone: '+919123456789',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.role, 'instructor');
      assert.strictEqual(res.body.data.status, 'active');

      instructorUser = {
        id: res.body.data.user_id,
        email: testInstructorRecord.email,
        role: 'instructor',
      };
      instructorToken = generateAccessToken(instructorUser);
    });

    it('1.2 Assigns instructor to course with primary status and curriculum management', async () => {
      const res = await request(app)
        .post(`/api/admin/instructors/courses/${testCourse.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          instructor_id: testInstructorRecord.id,
          is_primary: true,
          can_manage_curriculum: true,
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.is_primary, true);
      assert.strictEqual(res.body.data.can_manage_curriculum, true);

      // Verify courses.instructor_id sync
      const [courses] = await pool.query('SELECT instructor_id FROM courses WHERE id = ?', [testCourse.id]);
      assert.strictEqual(Number(courses[0].instructor_id), testInstructorRecord.id);
    });

    it('1.3 Assigns instructor to batch', async () => {
      const res = await request(app)
        .post(`/api/admin/instructors/batches/${testBatch.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          instructor_id: testInstructorRecord.id,
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.instructor_id, testInstructorRecord.id);
    });
  });

  // MODULE 2: INSTRUCTOR PORTAL
  describe('Module 2: Instructor Portal APIs', () => {
    it('2.1 Non-instructor receives 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/instructor/overview')
        .set('Authorization', `Bearer ${studentToken}`);

      assert.strictEqual(res.status, 403);
    });

    it('2.2 Authenticated instructor accesses dashboard overview', async () => {
      const res = await request(app)
        .get('/api/instructor/overview')
        .set('Authorization', `Bearer ${instructorToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(typeof res.body.data.metrics.assignedCoursesCount, 'number');
      assert.ok(res.body.data.metrics.assignedCoursesCount >= 1);
    });

    it('2.3 Instructor accesses assigned courses list', async () => {
      const res = await request(app)
        .get('/api/instructor/courses')
        .set('Authorization', `Bearer ${instructorToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const assigned = res.body.data.find(c => c.id === testCourse.id);
      assert.ok(assigned, 'Assigned test course must be listed');
      assert.strictEqual(assigned.can_manage_curriculum, true);
    });

    let createdSessionId = null;
    it('2.4 Instructor creates a batch session', async () => {
      const res = await request(app)
        .post('/api/instructor/sessions')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          batch_id: testBatch.id,
          session_number: 1,
          session_date: '2026-12-01',
          start_time: '10:00:00',
          end_time: '12:00:00',
          title: 'Introduction to Neural Networks',
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      createdSessionId = res.body.data.id;
    });

    it('2.5 Instructor records batch attendance', async () => {
      // First enroll student in this course
      await pool.query(`
        INSERT INTO course_enrollments (user_id, course_id, batch_id, enrollment_status, enrollment_source, enrolled_at)
        VALUES (?, ?, ?, 'active', 'free', NOW())
      `, [studentUser.id, testCourse.id, testBatch.id]);

      const res = await request(app)
        .post(`/api/instructor/sessions/${createdSessionId}/attendance`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          records: [
            { student_id: studentUser.id, status: 'present', notes: 'Attended full session' },
          ],
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.students.some(s => s.student_id === studentUser.id && s.attendance_status === 'present'));
    });

    it('2.6 Instructor uploads study material', async () => {
      const res = await request(app)
        .post('/api/instructor/materials')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          course_id: testCourse.id,
          title: 'Lecture 1 Slide Deck',
          material_type: 'notes',
          file_path: '/files/materials/lecture1.pdf',
          file_type: 'pdf',
          file_size_bytes: 1048576,
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.title, 'Lecture 1 Slide Deck');
    });

    it('2.7 Instructor updates profile bio and designation', async () => {
      const res = await request(app)
        .patch('/api/instructor/profile')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          designation: 'Principal AI Scientist & Fellow',
          bio: 'Passionate about machine intelligence and computer science.',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.designation, 'Principal AI Scientist & Fellow');
    });

    it('2.8 Instructor accesses enrolled students roster with completed lessons calculation', async () => {
      // Create a module, lesson and lesson progress record for this student
      const [modRes] = await pool.query(
        'INSERT INTO course_modules (course_id, title, display_order) VALUES (?, "Module 1", 1)',
        [testCourse.id]
      );
      const [lesRes] = await pool.query(
        'INSERT INTO course_lessons (module_id, title, lesson_type, display_order) VALUES (?, "Lesson 1", "video", 1)',
        [modRes.insertId]
      );
      await pool.query(
        'INSERT INTO lesson_progress (user_id, lesson_id, completed, last_position_seconds) VALUES (?, ?, 1, 120)',
        [studentUser.id, lesRes.insertId]
      );

      const res = await request(app)
        .get('/api/instructor/students')
        .set('Authorization', `Bearer ${instructorToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.total >= 1);
      const student = res.body.students.find(s => s.student_id === studentUser.id);
      assert.ok(student, 'Enrolled student must appear in roster');
      assert.strictEqual(student.completed_lessons_count, 1, 'Completed lessons count must be 1');
    });

    it('2.9 IDOR check: Unassigned instructor cannot see student roster', async () => {
      const unassignedUser = { id: 999981, email: 'unassigned@test.com', role: 'instructor' };
      const unassignedToken = generateAccessToken(unassignedUser);

      const res = await request(app)
        .get('/api/instructor/students')
        .set('Authorization', `Bearer ${unassignedToken}`);
      assert.strictEqual(res.status, 403);
    });

    it('2.10 Curriculum permission guard: Restricts module creation when can_manage_curriculum = 0', async () => {
      await pool.query('UPDATE course_instructors SET can_manage_curriculum = 0 WHERE course_id = ? AND instructor_id = ?', [testCourse.id, testInstructorRecord.id]);

      const res = await request(app)
        .post(`/api/instructor/courses/${testCourse.id}/modules`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ title: 'Unauthorized Module' });

      assert.strictEqual(res.status, 403);
      assert.ok(res.body.message.includes('restricted'));

      await pool.query('UPDATE course_instructors SET can_manage_curriculum = 1 WHERE course_id = ? AND instructor_id = ?', [testCourse.id, testInstructorRecord.id]);
    });
  });

  // MODULE 3: CONTACT QUERY MANAGEMENT
  describe('Module 3: Contact Query Management', () => {
    let createdContactId = null;

    it('3.1 Public user submits contact inquiry', async () => {
      const res = await request(app)
        .post('/api/contact')
        .send({
          name: 'Maya Sharma',
          email: 'maya@example.com',
          phone: '+919988776655',
          subject: 'Question about Deep Learning track',
          message: 'Hello, what are the prerequisites for this course?',
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.reference_id);
      createdContactId = res.body.reference_id;
    });

    it('3.2 Admin views contact inquiries', async () => {
      const res = await request(app)
        .get('/api/admin/contacts')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.contacts.some(c => c.id === createdContactId));
    });

    it('3.3 Admin updates contact inquiry status and notes', async () => {
      const res = await request(app)
        .patch(`/api/admin/contacts/${createdContactId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'in_progress',
          admin_notes: 'Assigned to admissions counselor for callback',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.status, 'in_progress');
    });
  });

  // MODULE 4: NOTIFICATIONS & WHATSAPP CONSENT
  describe('Module 4: Centralized Notifications & Consent Guard', () => {
    const testPhone = `+9199999${testRunId.toString().slice(-5)}`;
    cleanupPhones.push(testPhone);

    it('4.1 Admin updates notification settings for contact query event', async () => {
      const res = await request(app)
        .patch('/api/admin/notifications/settings/contact_query_received')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email_enabled: true,
          inapp_enabled: true,
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(Boolean(res.body.data.email_enabled), true);
    });

    it('4.2 WhatsApp message is suppressed if phone has NO opted_in consent', async () => {
      // Record pending consent (not opted_in)
      const consent = await notifRepo.getWhatsAppConsent(testPhone);
      assert.strictEqual(consent?.status || 'none', 'none');

      // Attempting to emit WhatsApp without consent will suppress dispatch in transport
      const { sendWhatsAppMessage } = await import('../src/modules/notifications/transports/whatsapp.transport.js');
      await assert.rejects(
        async () => {
          await sendWhatsAppMessage({ to: testPhone, text: 'Hello without consent' });
        },
        /has no opted_in consent/
      );
    });

    it('4.3 User opts in to WhatsApp notifications and receives valid consent record', async () => {
      const res = await request(app)
        .post('/api/notifications/whatsapp/consent')
        .send({
          phone: testPhone,
          status: 'opted_in',
          source: 'web_form',
          evidence: 'Student clicked checkbox on registration form',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.status, 'opted_in');

      // Now sendWhatsAppMessage passes consent guard (mock mode)
      const { sendWhatsAppMessage } = await import('../src/modules/notifications/transports/whatsapp.transport.js');
      const sent = await sendWhatsAppMessage({ to: testPhone, text: 'Hello with consent' });
      assert.strictEqual(sent.success, true);
    });

    it('4.4 Notification queue worker executes atomic CAS claiming and marks sent', async () => {
      // Queue a notification
      const queued = await notifRepo.queueNotification({
        idempotency_key: `test_notif_${testRunId}`,
        type: 'test_event',
        channel: 'email',
        recipient: 'test@example.com',
        payload: { subject: 'Test CAS', text: 'CAS claiming test' },
      });
      assert.ok(queued);
      assert.strictEqual(queued.status, 'queued');

      // Run worker iterations until queued item is processed
      for (let i = 0; i < 5; i++) {
        await runWorkerIteration(50);
        const [check] = await pool.query('SELECT status FROM notifications WHERE id = ?', [queued.id]);
        if (check[0]?.status === 'sent') break;
      }

      // Verify status changed to sent
      const [rows] = await pool.query('SELECT status, sent_at FROM notifications WHERE id = ?', [queued.id]);
      assert.strictEqual(rows[0].status, 'sent');
      assert.ok(rows[0].sent_at !== null);
    });

    it('4.5 Database trigger immutability prevents UPDATE/DELETE on audit_logs', async () => {
      const [auditRows] = await pool.query('SELECT id FROM audit_logs ORDER BY id DESC LIMIT 1');
      if (auditRows.length > 0) {
        const auditId = auditRows[0].id;

        // Try UPDATE -> Expect trigger error
        await assert.rejects(
          async () => {
            await pool.query('UPDATE audit_logs SET action = "tampered" WHERE id = ?', [auditId]);
          },
          /immutable/i
        );

        // Try DELETE -> Expect trigger error
        await assert.rejects(
          async () => {
            await pool.query('DELETE FROM audit_logs WHERE id = ?', [auditId]);
          },
          /immutable/i
        );
      }
    });

    it('4.6 Admin manual enrollment queues notification with authoritative student email and phone', async () => {
      await pool.query("UPDATE notification_settings SET inapp_enabled = 1, email_enabled = 1, notify_student = 1 WHERE event_type = 'course_booking_created'");
      await pool.query('DELETE FROM course_enrollments WHERE user_id = ? AND course_id = ?', [studentUser.id, testCourse.id]);

      const enrollRes = await request(app)
        .post('/api/admin/enrollments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: studentUser.id,
          course_id: testCourse.id,
          batch_id: testBatch.id,
        });

      if (enrollRes.status !== 201) {
        console.error('Test 4.6 enrollRes failure:', enrollRes.status, enrollRes.body);
      }
      assert.strictEqual(enrollRes.status, 201);

      const [notifs] = await pool.query(
        "SELECT * FROM notifications WHERE event_type = 'course_booking_created' AND recipient = ? ORDER BY id DESC LIMIT 1",
        [studentUser.email]
      );
      assert.ok(notifs.length > 0, 'Notification should be queued for student email');
      assert.strictEqual(notifs[0].status, 'queued');
    });

    it('4.7 Admin enrollment cancellation queues notification with resolved student details', async () => {
      await pool.query("UPDATE notification_settings SET inapp_enabled = 1, email_enabled = 1, notify_student = 1 WHERE event_type = 'course_booking_cancelled'");

      const [enrRows] = await pool.query("SELECT id FROM course_enrollments WHERE user_id = ? AND course_id = ? AND enrollment_status = 'active' LIMIT 1", [studentUser.id, testCourse.id]);
      if (enrRows.length > 0) {
        const enrId = enrRows[0].id;
        const res = await request(app)
          .patch(`/api/admin/enrollments/${enrId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ enrollment_status: 'cancelled', notes: 'Administrative withdrawal' });

        assert.strictEqual(res.status, 200);

        const [cancelNotifs] = await pool.query(
          "SELECT * FROM notifications WHERE event_type = 'course_booking_cancelled' AND recipient = ? ORDER BY id DESC LIMIT 1",
          [studentUser.email]
        );
        assert.ok(cancelNotifs.length > 0, 'Cancellation notification should be queued for student email');
      }
    });

    it('4.8 Course inquiry queues course_inquiry_received event without live slot', async () => {
      await pool.query("UPDATE notification_settings SET inapp_enabled = 1, email_enabled = 1, notify_student = 1, notify_super_admin = 1, notify_instructor = 1 WHERE event_type = 'course_inquiry_received'");
      await pool.query("INSERT INTO course_demo_settings (course_id, demo_enabled, demo_request_enabled, accepting_requests) VALUES (?, 1, 1, 1) ON DUPLICATE KEY UPDATE demo_enabled = 1, demo_request_enabled = 1, accepting_requests = 1", [testCourse.id]);

      const inquiryEmail = `inquiry_${testRunId}@example.com`;
      const inquiryPhone = '9876543210';

      const demoRes = await request(app)
        .post(`/api/courses/${testCourse.id}/demo-requests`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          student_name: 'Inquiring Student',
          email: inquiryEmail,
          phone: inquiryPhone,
          preferred_demo_type: 'recorded',
          message: 'Interested in the deep learning syllabus and schedule.',
          consent: true,
        });

      if (demoRes.status !== 201) {
        console.error('Test 4.8 demoRes failure:', demoRes.status, demoRes.body);
      }
      assert.strictEqual(demoRes.status, 201);

      const [inqNotifs] = await pool.query(
        "SELECT * FROM notifications WHERE event_type = 'course_inquiry_received' AND recipient = ?",
        [inquiryEmail]
      );
      assert.ok(inqNotifs.length > 0, 'course_inquiry_received notification must be queued for student');
      assert.strictEqual(inqNotifs[0].event_type, 'course_inquiry_received');
    });

    it('4.9 Idempotency blocks duplicate notifications for identical event and recipient', async () => {
      const idKey = `idemp_test_${testRunId}_email_test@example.com`;
      const first = await notifRepo.queueNotification({
        idempotency_key: idKey,
        type: 'test_idempotency',
        channel: 'email',
        recipient: 'test@example.com',
        payload: { text: 'first attempt' },
      });
      assert.ok(first);

      const second = await notifRepo.queueNotification({
        idempotency_key: idKey,
        type: 'test_idempotency',
        channel: 'email',
        recipient: 'test@example.com',
        payload: { text: 'second attempt' },
      });
      assert.ok(!second || second.id === first.id);
    });
  });
});
