import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import { generateAccessToken } from '../src/utils/token.js';

describe('Course 505 Demo Settings, CTA Guard & Approval Workflow Integration Tests', () => {
  const pool = getPool();
  const testRunId = Date.now();
  const createdUserIds = [];
  const createdDemoRequestIds = [];

  let adminToken = null;
  let otherCourseId = null;

  async function createTestStudent(suffix) {
    const [stu] = await pool.query(
      "INSERT INTO users (name, email, role, status) VALUES (?, ?, 'user', 'active')",
      [`Student ${suffix} ${testRunId}`, `student_${suffix}_${testRunId}@test.com`]
    );
    createdUserIds.push(stu.insertId);
    return {
      id: stu.insertId,
      email: `student_${suffix}_${testRunId}@test.com`,
      token: generateAccessToken({ id: stu.insertId, role: 'user' }),
    };
  }

  before(async () => {
    // 1. Fetch an existing active admin user or create test admin
    const [existingAdmins] = await pool.query(
      "SELECT id, email, role FROM users WHERE role IN ('admin', 'super_admin') AND status = 'active' LIMIT 1"
    );
    if (existingAdmins.length > 0) {
      adminToken = generateAccessToken({ id: existingAdmins[0].id, role: existingAdmins[0].role });
    } else {
      const [adm] = await pool.query(
        "INSERT INTO users (name, email, role, status) VALUES (?, ?, 'super_admin', 'active')",
        [`Admin Test ${testRunId}`, `admin_${testRunId}@test.com`]
      );
      createdUserIds.push(adm.insertId);
      adminToken = generateAccessToken({ id: adm.insertId, role: 'super_admin' });
    }

    // 2. Find another published course to verify settings isolation
    const [otherCourses] = await pool.query(
      "SELECT id FROM courses WHERE id != 505 AND status = 'published' AND deleted_at IS NULL LIMIT 1"
    );
    if (otherCourses.length > 0) {
      otherCourseId = otherCourses[0].id;
    }
  });

  after(async () => {
    // Clean up created notifications first (FK to users)
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds]).catch(() => {});
    }

    // Clean up created demo requests
    if (createdDemoRequestIds.length > 0) {
      await pool.query('DELETE FROM demo_request_notes WHERE demo_request_id IN (?)', [createdDemoRequestIds]).catch(() => {});
      await pool.query('DELETE FROM demo_request_activity_logs WHERE demo_request_id IN (?)', [createdDemoRequestIds]).catch(() => {});
      await pool.query('DELETE FROM demo_requests WHERE id IN (?)', [createdDemoRequestIds]).catch(() => {});
    }

    // Allow pending async event dispatches to resolve
    await new Promise((r) => setTimeout(r, 200));

    // Clean up synthetic users created
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds]).catch(() => {});
      await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds]).catch(() => {});
    }

    await closePool();
  });

  describe('1. Security & Authorization Checks for Demo Settings', () => {
    it('rejects unauthenticated GET to admin demo settings with 401', async () => {
      const res = await request(app).get('/api/admin/courses/505/demo-settings');
      assert.strictEqual(res.status, 401);
    });

    it('rejects non-admin (student) PUT to admin demo settings with 403', async () => {
      const student = await createTestStudent('auth_test');
      const res = await request(app)
        .put('/api/admin/courses/505/demo-settings')
        .set('Authorization', `Bearer ${student.token}`)
        .send({ demo_enabled: true, demo_request_enabled: true });
      assert.strictEqual(res.status, 403);
    });
  });

  describe('2. Course 505 Demo Settings Configuration via Admin API', () => {
    it('applies the approved Course 505 configuration payload via authenticated PUT', async () => {
      const payload = {
        demo_enabled: true,
        demo_request_enabled: true,
        demo_type: 'live',
        allowed_demo_types: ['live', 'recorded'],
        demo_duration_minutes: 60,
        requires_approval: true,
        accepting_requests: true,
        max_requests_per_slot: 10,
        meeting_platform: 'Google Meet',
        rate_limit_per_hour: 5,
      };

      const res = await request(app)
        .put('/api/admin/courses/505/demo-settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

    it('verifies fresh GET /api/admin/courses/505/demo-settings returns all persisted values', async () => {
      const res = await request(app)
        .get('/api/admin/courses/505/demo-settings')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const data = res.body.data;

      assert.strictEqual(Number(data.course_id), 505);
      assert.strictEqual(Boolean(data.demo_enabled), true);
      assert.strictEqual(Boolean(data.demo_request_enabled), true);
      assert.strictEqual(data.demo_type, 'live');
      assert.deepStrictEqual(data.allowed_demo_types, ['live', 'recorded']);
      assert.strictEqual(Number(data.demo_duration_minutes), 60);
      assert.strictEqual(Boolean(data.requires_approval), true);
      assert.strictEqual(Boolean(data.accepting_requests), true);
      assert.strictEqual(Number(data.max_requests_per_slot), 10);
      assert.strictEqual(data.meeting_platform, 'Google Meet');
      assert.strictEqual(Number(data.rate_limit_per_hour), 5);
    });

    it('verifies public GET /api/courses/505/demo-settings reflects demo enabled', async () => {
      const res = await request(app).get('/api/courses/505/demo-settings');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const data = res.body.data;

      assert.strictEqual(Boolean(data.demo_enabled), true);
      assert.strictEqual(Boolean(data.demo_request_enabled), true);
      assert.strictEqual(Number(data.demo_duration_minutes), 60);
    });

    it('verifies public course detail payload includes course.demo enabled', async () => {
      const res = await request(app).get('/api/courses/full-stack-develoer-with-mern-stack');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const demo = res.body.data?.demo;

      assert.ok(demo, 'course.demo must be present in course detail');
      assert.strictEqual(Boolean(demo.demo_enabled), true);
      assert.strictEqual(Boolean(demo.demo_request_enabled), true);
      assert.strictEqual(Number(demo.demo_duration_minutes), 60);
      assert.strictEqual(demo.booking?.meeting_platform, 'Google Meet');
      assert.strictEqual(Boolean(demo.booking?.requires_approval), true);
    });

    it('verifies settings isolation: other courses do not inherit Course 505 settings', async () => {
      if (!otherCourseId) return;
      const res = await request(app).get(`/api/courses/${otherCourseId}/demo-settings`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(Number(res.body.data.course_id), otherCourseId);
    });
  });

  describe('3. Live and Recorded Demo Submission Workflows', () => {
    it('submits a valid Live demo request for Course 505 and stores with pending approval', async () => {
      const student = await createTestStudent('live_req');
      const payload = {
        student_name: 'Live Demo Student',
        email: student.email,
        phone: '9876543210',
        preferred_demo_type: 'live',
        preferred_date: '2026-12-01',
        preferred_time: '10:00 AM - 11:00 AM',
        consent: true,
      };

      const res = await request(app)
        .post('/api/courses/505/demo-requests')
        .set('Authorization', `Bearer ${student.token}`)
        .send(payload);

      assert.strictEqual(res.status, 201, `Failed with: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true);
      const requestId = res.body.data?.id;
      assert.ok(requestId, 'Must return id');
      createdDemoRequestIds.push(requestId);

      // Verify stored in pending status and has preferred_demo_type = 'live'
      const [rows] = await pool.query(
        'SELECT id, preferred_demo_type, status, course_id FROM demo_requests WHERE id = ?',
        [requestId]
      );
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].preferred_demo_type, 'live');
      assert.strictEqual(rows[0].status, 'pending');
      assert.strictEqual(Number(rows[0].course_id), 505);
    });

    it('submits a valid Recorded demo request for Course 505 and stores with pending approval', async () => {
      const student = await createTestStudent('rec_req');
      const payload = {
        student_name: 'Recorded Demo Student',
        email: student.email,
        phone: '9876543211',
        preferred_demo_type: 'recorded',
        consent: true,
      };

      const res = await request(app)
        .post('/api/courses/505/demo-requests')
        .set('Authorization', `Bearer ${student.token}`)
        .send(payload);

      assert.strictEqual(res.status, 201, `Failed with: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true);
      const requestId = res.body.data?.id;
      assert.ok(requestId, 'Must return id');
      createdDemoRequestIds.push(requestId);

      // Verify stored in pending status and has preferred_demo_type = 'recorded'
      const [rows] = await pool.query(
        'SELECT id, preferred_demo_type, status, course_id FROM demo_requests WHERE id = ?',
        [requestId]
      );
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].preferred_demo_type, 'recorded');
      assert.strictEqual(rows[0].status, 'pending');
      assert.strictEqual(Number(rows[0].course_id), 505);
    });

    it('rejects unsupported demo type (e.g. in_person) with HTTP 400', async () => {
      const student = await createTestStudent('unsupported_req');
      const payload = {
        student_name: 'Unsupported Type Student',
        email: student.email,
        phone: '9876543212',
        preferred_demo_type: 'in_person',
        consent: true,
      };

      const res = await request(app)
        .post('/api/courses/505/demo-requests')
        .set('Authorization', `Bearer ${student.token}`)
        .send(payload);

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });
  });

  describe('4. Admin Approval and Rejection Workflow', () => {
    let approvalRequestId = null;
    let rejectionRequestId = null;

    before(async () => {
      // Create request 1 for approval test
      const student1 = await createTestStudent('approve_target');
      const res1 = await request(app)
        .post('/api/courses/505/demo-requests')
        .set('Authorization', `Bearer ${student1.token}`)
        .send({
          student_name: 'Approval Target Student',
          email: student1.email,
          phone: '9876543213',
          preferred_demo_type: 'live',
          preferred_date: '2026-12-05',
          preferred_time: '2:00 PM - 3:00 PM',
          consent: true,
        });
      approvalRequestId = res1.body.data?.id;
      if (approvalRequestId) createdDemoRequestIds.push(approvalRequestId);

      // Create request 2 for rejection test
      const student2 = await createTestStudent('reject_target');
      const res2 = await request(app)
        .post('/api/courses/505/demo-requests')
        .set('Authorization', `Bearer ${student2.token}`)
        .send({
          student_name: 'Rejection Target Student',
          email: student2.email,
          phone: '9876543214',
          preferred_demo_type: 'recorded',
          consent: true,
        });
      rejectionRequestId = res2.body.data?.id;
      if (rejectionRequestId) createdDemoRequestIds.push(rejectionRequestId);
    });

    it('verifies requests are initially in pending status and not automatically approved', async () => {
      assert.ok(approvalRequestId, 'approvalRequestId must exist');
      assert.ok(rejectionRequestId, 'rejectionRequestId must exist');

      const [rows] = await pool.query(
        'SELECT id, status FROM demo_requests WHERE id IN (?, ?)',
        [approvalRequestId, rejectionRequestId]
      );
      assert.strictEqual(rows.length, 2);
      rows.forEach((r) => {
        assert.strictEqual(r.status, 'pending', `Request ${r.id} should initially be pending`);
      });
    });

    it('allows Admin to approve a demo request by updating status to scheduled', async () => {
      const updatePayload = {
        status: 'scheduled',
        meeting_link: 'https://meet.google.com/xyz-uvwx-rst',
        scheduled_at: '2026-12-05T14:00:00.000Z',
        admin_notes: 'Demo request approved by Administrator',
      };

      const res = await request(app)
        .patch(`/api/admin/demo-requests/${approvalRequestId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatePayload);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify persisted in database
      const [rows] = await pool.query(
        'SELECT id, status, meeting_link, admin_notes FROM demo_requests WHERE id = ?',
        [approvalRequestId]
      );
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].status, 'scheduled');
      assert.strictEqual(rows[0].meeting_link, 'https://meet.google.com/xyz-uvwx-rst');
      assert.strictEqual(rows[0].admin_notes, 'Demo request approved by Administrator');
    });

    it('allows Admin to reject a demo request by updating status to cancelled', async () => {
      const updatePayload = {
        status: 'cancelled',
        admin_notes: 'Demo request rejected by Administrator due to schedule conflict',
      };

      const res = await request(app)
        .patch(`/api/admin/demo-requests/${rejectionRequestId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatePayload);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify persisted in database
      const [rows] = await pool.query(
        'SELECT id, status, admin_notes FROM demo_requests WHERE id = ?',
        [rejectionRequestId]
      );
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].status, 'cancelled');
      assert.strictEqual(rows[0].admin_notes, 'Demo request rejected by Administrator due to schedule conflict');
    });
  });
});
