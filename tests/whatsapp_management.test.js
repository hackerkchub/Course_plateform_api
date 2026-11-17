import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import { generateAccessToken } from '../src/utils/token.js';
import {
  normalizePhoneNumber,
  interpolateWhatsAppMessage,
  buildClickToChatUrl,
} from '../src/modules/whatsapp/whatsapp.service.js';

describe('Centralized WhatsApp Management System & Course-Wise Routing Integration Tests', () => {
  const pool = getPool();
  const testRunId = Date.now();
  const createdContactIds = [];
  const createdUserIds = [];

  let adminToken = null;
  let studentToken = null;
  let testCourseId = null;
  let testCourseSlug = null;
  let course505Slug = null;
  let initialDefaultContactId = null;

  before(async () => {
    // Record existing default contact so we can restore it after test run
    const [existingDefaults] = await pool.query(
      "SELECT id FROM whatsapp_contacts WHERE is_default = 1 AND deleted_at IS NULL LIMIT 1"
    );
    if (existingDefaults.length > 0) {
      initialDefaultContactId = existingDefaults[0].id;
    }

    // 1. Authenticated Admin & Student tokens
    const [existingAdmins] = await pool.query(
      "SELECT id, role FROM users WHERE role IN ('admin', 'super_admin') AND status = 'active' LIMIT 1"
    );
    if (existingAdmins.length > 0) {
      adminToken = generateAccessToken({ id: existingAdmins[0].id, role: existingAdmins[0].role });
    } else {
      const [adm] = await pool.query(
        "INSERT INTO users (name, email, role, status) VALUES (?, ?, 'super_admin', 'active')",
        [`Admin WA ${testRunId}`, `admin_wa_${testRunId}@test.com`]
      );
      createdUserIds.push(adm.insertId);
      adminToken = generateAccessToken({ id: adm.insertId, role: 'super_admin' });
    }

    const [stu] = await pool.query(
      "INSERT INTO users (name, email, role, status) VALUES (?, ?, 'user', 'active')",
      [`Student WA ${testRunId}`, `student_wa_${testRunId}@test.com`]
    );
    createdUserIds.push(stu.insertId);
    studentToken = generateAccessToken({ id: stu.insertId, role: 'user' });

    // 2. Fetch a published course for test isolation
    const [courses] = await pool.query(
      "SELECT id, slug FROM courses WHERE status = 'published' AND deleted_at IS NULL ORDER BY id ASC LIMIT 2"
    );
    if (courses.length > 0) {
      testCourseId = courses[0].id;
      testCourseSlug = courses[0].slug;
    }

    // 3. Find Course 505
    const [c505] = await pool.query(
      "SELECT id, slug FROM courses WHERE id = 505 LIMIT 1"
    );
    if (c505.length > 0) {
      course505Slug = c505[0].slug;
    }
  });

  after(async () => {
    // Clean up created WhatsApp contacts
    if (createdContactIds.length > 0) {
      await pool.query('DELETE FROM whatsapp_contacts WHERE id IN (?)', [createdContactIds]).catch(() => {});
    }
    // Restore initial default contact if one was designated
    if (initialDefaultContactId) {
      await pool.query('UPDATE whatsapp_contacts SET is_default = 0 WHERE is_default = 1').catch(() => {});
      await pool.query('UPDATE whatsapp_contacts SET is_default = 1, is_active = 1 WHERE id = ?', [initialDefaultContactId]).catch(() => {});
    }
    // Clean up users
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds]).catch(() => {});
      await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds]).catch(() => {});
    }
    await closePool();
  });

  // =========================================================================
  // 1. Phone Normalization & Message Interpolation Unit Tests
  // =========================================================================
  it('1.1 should correctly normalize standard 10-digit Indian numbers starting with 6-9', () => {
    assert.strictEqual(normalizePhoneNumber('9876543210', '+91'), '919876543210');
    assert.strictEqual(normalizePhoneNumber('6123456789', '+91'), '916123456789');
    assert.strictEqual(normalizePhoneNumber('7890123456', '+91'), '917890123456');
    assert.strictEqual(normalizePhoneNumber('8901234567', '+91'), '918901234567');
  });

  it('1.2 should correctly normalize formatted Indian numbers with spaces, hyphens, and leading zero', () => {
    assert.strictEqual(normalizePhoneNumber('+91 98765-43210', '+91'), '919876543210');
    assert.strictEqual(normalizePhoneNumber('09876543210', '+91'), '919876543210');
    assert.strictEqual(normalizePhoneNumber('919876543210', '+91'), '919876543210');
  });

  it('1.3 should reject invalid Indian mobile numbers starting with 0-5 or wrong length', () => {
    assert.throws(() => normalizePhoneNumber('1234567890', '+91'), /Invalid Indian mobile number/);
    assert.throws(() => normalizePhoneNumber('5555555555', '+91'), /Invalid Indian mobile number/);
    assert.throws(() => normalizePhoneNumber('98765', '+91'), /Invalid Indian phone number format/);
  });

  it('1.4 should correctly normalize international numbers adhering to E.164 without leading plus', () => {
    assert.strictEqual(normalizePhoneNumber('5551234567', '+1'), '15551234567');
    assert.strictEqual(normalizePhoneNumber('+44 7911 123456', '+44'), '447911123456');
  });

  it('1.5 should correctly interpolate course tokens and generate valid click-to-chat URL', () => {
    const template = 'Hi Admissions, enquiring about {{course_name}} (Code: {{course_code}}). Link: {{course_url}}';
    const message = interpolateWhatsAppMessage(template, {
      courseName: 'MERN Full Stack',
      courseCode: 'MERN-101',
      courseUrl: 'https://softmaxs.com/courses/mern-full-stack',
    });

    assert.strictEqual(message, 'Hi Admissions, enquiring about MERN Full Stack (Code: MERN-101). Link: https://softmaxs.com/courses/mern-full-stack');

    const url = buildClickToChatUrl('919876543210', message);
    assert.ok(url.startsWith('https://wa.me/919876543210?text='));
    assert.ok(url.includes(encodeURIComponent('MERN Full Stack')));
  });

  // =========================================================================
  // 2. Authentication & Role Authorization Guards
  // =========================================================================
  it('2.1 should reject unauthenticated requests to /api/admin/whatsapp with 401', async () => {
    const res = await request(app).get('/api/admin/whatsapp');
    assert.strictEqual(res.status, 401);
  });

  it('2.2 should reject requests from non-admin roles (student) with 403', async () => {
    const res = await request(app)
      .get('/api/admin/whatsapp')
      .set('Authorization', `Bearer ${studentToken}`);
    assert.strictEqual(res.status, 403);
  });

  // =========================================================================
  // 3. Admin WhatsApp Management CRUD & Single Default Invariant
  // =========================================================================
  let firstContactId = null;
  let secondContactId = null;

  it('3.1 should create first WhatsApp contact and designate it as default', async () => {
    const payload = {
      display_name: `Primary Admissions Desk ${testRunId}`,
      department: 'admissions',
      country_code: '+91',
      phone_number: '9876543210',
      is_active: true,
      is_default: true,
      custom_message_template: 'Hello SoftMax Admissions, I would like details about {{course_name}}.',
      notes: 'Main helpline phone',
    };

    const res = await request(app)
      .post('/api/admin/whatsapp')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.display_name, payload.display_name);
    assert.strictEqual(res.body.data.normalized_phone, '919876543210');
    assert.strictEqual(res.body.data.is_default, true); // First contact becomes default
    assert.strictEqual(res.body.data.is_active, true);

    firstContactId = res.body.data.id;
    createdContactIds.push(firstContactId);
  });

  it('3.2 should create a second contact with is_default=true and atomically unset default on the first', async () => {
    const payload = {
      display_name: `Counselling Desk 2 ${testRunId}`,
      department: 'counselling',
      country_code: '+91',
      phone_number: '9812345678',
      is_active: true,
      is_default: true,
      notes: 'Dedicated counselling desk',
    };

    const res = await request(app)
      .post('/api/admin/whatsapp')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.is_default, true);
    secondContactId = res.body.data.id;
    createdContactIds.push(secondContactId);

    // Verify first contact is no longer default
    const checkFirst = await request(app)
      .get(`/api/admin/whatsapp/${firstContactId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(checkFirst.status, 200);
    assert.strictEqual(checkFirst.body.data.is_default, false);
  });

  it('3.3 should list WhatsApp contacts with search and department filtering', async () => {
    const res = await request(app)
      .get('/api/admin/whatsapp?department=admissions')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    const found = res.body.data.find(c => c.id === firstContactId);
    assert.ok(found, 'First admissions contact should be present in department=admissions list');
  });

  it('3.4 should atomically switch default line via /api/admin/whatsapp/:id/set-default', async () => {
    const res = await request(app)
      .post(`/api/admin/whatsapp/${firstContactId}/set-default`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.is_default, true);

    // Check second contact is now not default
    const checkSecond = await request(app)
      .get(`/api/admin/whatsapp/${secondContactId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(checkSecond.body.data.is_default, false);
  });

  it('3.5 should prevent deactivating the designated default WhatsApp contact', async () => {
    const res = await request(app)
      .patch(`/api/admin/whatsapp/${firstContactId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('default WhatsApp contact'));
  });

  it('3.6 should prevent deleting the designated default WhatsApp contact', async () => {
    const res = await request(app)
      .delete(`/api/admin/whatsapp/${firstContactId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('default WhatsApp contact'));
  });

  it('3.7 should allow deactivating and soft deleting a non-default contact', async () => {
    // 1. Deactivate second contact
    const statusRes = await request(app)
      .patch(`/api/admin/whatsapp/${secondContactId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false });

    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.body.data.is_active, false);

    // 2. Soft delete second contact
    const deleteRes = await request(app)
      .delete(`/api/admin/whatsapp/${secondContactId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(deleteRes.status, 200);

    // 3. Confirm 404 on get
    const checkRes = await request(app)
      .get(`/api/admin/whatsapp/${secondContactId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(checkRes.status, 404);
  });

  it('3.8 should generate a preview with variable interpolation for a contact', async () => {
    const res = await request(app)
      .get(`/api/admin/whatsapp/${firstContactId}/preview?course_id=${testCourseId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.click_to_chat_url.startsWith('https://wa.me/919876543210'));
  });

  // =========================================================================
  // 4. Course Assignment & Public Resolution Workflow
  // =========================================================================
  it('4.1 should update a course to explicitly inherit the global default WhatsApp line', async () => {
    const res = await request(app)
      .patch(`/api/admin/courses/${testCourseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        whatsapp_enabled: true,
        whatsapp_contact_id: null,
      });

    assert.strictEqual(res.status, 200);
  });

  it('4.2 should resolve the global default contact on public GET /api/courses/:slug', async () => {
    const res = await request(app).get(`/api/courses/${testCourseSlug}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.whatsapp, 'whatsapp object must exist in course payload');
    assert.strictEqual(res.body.data.whatsapp.available, true);
    assert.ok(res.body.data.whatsapp.click_to_chat_url.includes('919876543210'));
  });

  it('4.3 should return available=false when whatsapp_enabled is set to false on a course', async () => {
    // Disable WhatsApp for test course
    await request(app)
      .patch(`/api/admin/courses/${testCourseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ whatsapp_enabled: false });

    const res = await request(app).get(`/api/courses/${testCourseSlug}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.whatsapp.available, false);
    assert.strictEqual(res.body.data.whatsapp.click_to_chat_url, undefined);

    // Restore enabled
    await request(app)
      .patch(`/api/admin/courses/${testCourseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ whatsapp_enabled: true, whatsapp_contact_id: null });
  });

  // =========================================================================
  // 5. Verification on Target Course 505
  // =========================================================================
  it('5.1 should verify Course 505 inherits active default WhatsApp line without modifying DB directly', async () => {
    if (!course505Slug) return;

    const res = await request(app).get(`/api/courses/${course505Slug}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.whatsapp.available, true);
    assert.ok(res.body.data.whatsapp.click_to_chat_url.startsWith('https://wa.me/'));
    assert.ok(res.body.data.whatsapp.prefilled_message.length > 0);
  });
});
