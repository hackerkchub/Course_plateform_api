import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import {
  setGoogleTokenVerifierForTesting,
  resetGoogleTokenVerifierForTesting,
} from '../src/config/google.js';
import { generateAccessToken, generateRefreshToken, hashToken } from '../src/utils/token.js';

describe('Staff & Counsellor Management Admin Tests', () => {
  const pool = getPool();
  const testRunId = Date.now();
  const syntheticUsers = [];
  const createdAuditLogIds = [];

  let adminUser = null;
  let adminToken = null;
  let superAdminUser = null;
  let superAdminToken = null;
  let studentUser = null;
  let studentToken = null;
  let counsellorUser = null;
  let counsellorToken = null;

  before(async () => {
    // Verify DB
    const [dbCheck] = await pool.query('SELECT DATABASE() as current_db');
    assert.strictEqual(dbCheck[0]?.current_db, 'course_platform_db');

    // 1. Create synthetic admin
    const adminEmail = `admin_test_${testRunId}@test.com`;
    syntheticUsers.push(adminEmail);
    const [resAdmin] = await pool.query(
      "INSERT INTO users (name, email, role, status, email_verified) VALUES ('Test Admin', ?, 'admin', 'active', TRUE)",
      [adminEmail]
    );
    adminUser = { id: resAdmin.insertId, email: adminEmail, role: 'admin' };
    adminToken = generateAccessToken(adminUser);

    // 2. Create synthetic super admin
    const superAdminEmail = `superadmin_test_${testRunId}@test.com`;
    syntheticUsers.push(superAdminEmail);
    const [resSuper] = await pool.query(
      "INSERT INTO users (name, email, role, status, email_verified) VALUES ('Test Super Admin', ?, 'super_admin', 'active', TRUE)",
      [superAdminEmail]
    );
    superAdminUser = { id: resSuper.insertId, email: superAdminEmail, role: 'super_admin' };
    superAdminToken = generateAccessToken(superAdminUser);

    // 3. Create synthetic student
    const studentEmail = `student_test_${testRunId}@test.com`;
    syntheticUsers.push(studentEmail);
    const [resStudent] = await pool.query(
      "INSERT INTO users (name, email, role, status, email_verified) VALUES ('Test Student', ?, 'user', 'active', TRUE)",
      [studentEmail]
    );
    studentUser = { id: resStudent.insertId, email: studentEmail, role: 'user' };
    studentToken = generateAccessToken(studentUser);

    // 4. Create synthetic counsellor
    const counsellorEmail = `counsellor_test_${testRunId}@test.com`;
    syntheticUsers.push(counsellorEmail);
    const [resCounsellor] = await pool.query(
      "INSERT INTO users (name, email, role, status, email_verified) VALUES ('Test Counsellor', ?, 'counsellor', 'active', TRUE)",
      [counsellorEmail]
    );
    counsellorUser = { id: resCounsellor.insertId, email: counsellorEmail, role: 'counsellor' };
    counsellorToken = generateAccessToken(counsellorUser);
  });

  after(async () => {
    resetGoogleTokenVerifierForTesting();

    if (syntheticUsers.length > 0) {
      const placeholders = syntheticUsers.map(() => '?').join(',');
      await pool.query(`DELETE FROM users WHERE email IN (${placeholders})`, syntheticUsers);
    }

    await closePool();
  });

  beforeEach(() => {
    resetGoogleTokenVerifierForTesting();
  });

  describe('1. Provisioning Counsellors (POST /api/admin/users/counsellors)', () => {
    it('should successfully provision a new Counsellor account', async () => {
      const email = `ananya_${testRunId}@test.com`;
      syntheticUsers.push(email);

      const res = await request(app)
        .post('/api/admin/users/counsellors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Ananya Sen',
          email,
          phone: '9876543210',
        })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.counsellor.name, 'Ananya Sen');
      assert.strictEqual(res.body.data.counsellor.email, email);
      assert.strictEqual(res.body.data.counsellor.role, 'counsellor');
      assert.strictEqual(res.body.data.counsellor.status, 'active');
      assert.strictEqual(res.body.data.counsellor.google_id_linked, false);
      assert.strictEqual(res.body.data.counsellor.email_verified, false);

      // Verify DB record directly
      const [rows] = await pool.query('SELECT role, status, google_id, email_verified FROM users WHERE email = ?', [email]);
      assert.strictEqual(rows[0].role, 'counsellor');
      assert.strictEqual(rows[0].status, 'active');
      assert.strictEqual(rows[0].google_id, null);
      assert.strictEqual(rows[0].email_verified, 0);

      // Verify audit log entry
      const [auditRows] = await pool.query(
        "SELECT id, action, entity_type, entity_id FROM audit_logs WHERE action = 'counsellor.create' AND entity_id = ?",
        [res.body.data.counsellor.id]
      );
      assert.strictEqual(auditRows.length, 1);
      createdAuditLogIds.push(auditRows[0].id);
    });

    it('should reject provisioning with a duplicate email (409)', async () => {
      const email = `dup_counsellor_${testRunId}@test.com`;
      syntheticUsers.push(email);

      // Provision once
      await request(app)
        .post('/api/admin/users/counsellors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'First Copy', email })
        .expect(201);

      // Attempt duplicate
      const res = await request(app)
        .post('/api/admin/users/counsellors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Second Copy', email })
        .expect(409);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('already exists'));
    });

    it('should reject provisioning with an invalid email address (400)', async () => {
      const res = await request(app)
        .post('/api/admin/users/counsellors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Invalid Email User', email: 'not-an-email' })
        .expect(400);

      assert.strictEqual(res.body.success, false);
    });

    it('should reject provisioning if email belongs to an existing student with helpful advice (409)', async () => {
      const res = await request(app)
        .post('/api/admin/users/counsellors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Existing Student', email: studentUser.email })
        .expect(409);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('promotion workflow'));
    });
  });

  describe('2. Promoting Existing Students (POST /api/admin/users/counsellors/promote)', () => {
    it('should successfully promote an existing Student to Counsellor', async () => {
      const email = `promotee_${testRunId}@test.com`;
      syntheticUsers.push(email);

      const [insertRes] = await pool.query(
        "INSERT INTO users (name, email, role, status, email_verified) VALUES ('Promotee Student', ?, 'user', 'active', TRUE)",
        [email]
      );
      const targetId = insertRes.insertId;

      const res = await request(app)
        .post('/api/admin/users/counsellors/promote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.counsellor.role, 'counsellor');

      // Verify DB role changed
      const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [targetId]);
      assert.strictEqual(rows[0].role, 'counsellor');

      // Verify audit log entry
      const [auditRows] = await pool.query(
        "SELECT id FROM audit_logs WHERE action = 'counsellor.promote' AND entity_id = ?",
        [targetId]
      );
      assert.strictEqual(auditRows.length, 1);
      createdAuditLogIds.push(auditRows[0].id);
    });

    it('should reject promoting a user who is already a Counsellor (400)', async () => {
      const res = await request(app)
        .post('/api/admin/users/counsellors/promote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: counsellorUser.email })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('already a counsellor'));
    });

    it('should reject promoting an Admin or Super Admin (403)', async () => {
      const resAdmin = await request(app)
        .post('/api/admin/users/counsellors/promote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: adminUser.email })
        .expect(403);

      assert.strictEqual(resAdmin.body.success, false);

      const resSuper = await request(app)
        .post('/api/admin/users/counsellors/promote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: superAdminUser.email })
        .expect(403);

      assert.strictEqual(resSuper.body.success, false);
    });
  });

  describe('3. Listing and Filtering Counsellors (GET /api/admin/users/counsellors)', () => {
    it('should return paginated list of counsellors with summary telemetry', async () => {
      const res = await request(app)
        .get('/api/admin/users/counsellors')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.counsellors));
      assert.ok(res.body.data.pagination);
      assert.ok(res.body.data.summary);
      assert.ok(res.body.data.summary.total >= 1);
    });

    it('should filter counsellors by status', async () => {
      const res = await request(app)
        .get('/api/admin/users/counsellors?status=active')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      res.body.data.counsellors.forEach((c) => {
        assert.strictEqual(c.status, 'active');
      });
    });

    it('should search counsellors by query term', async () => {
      const res = await request(app)
        .get(`/api/admin/users/counsellors?search=${counsellorUser.email}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.counsellors.length, 1);
      assert.strictEqual(res.body.data.counsellors[0].email, counsellorUser.email);
    });
  });

  describe('4. Counsellor Details & Lead Metrics (GET /api/admin/users/counsellors/:id)', () => {
    it('should return counsellor details along with real demo lead metrics', async () => {
      const res = await request(app)
        .get(`/api/admin/users/counsellors/${counsellorUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.counsellor.id, counsellorUser.id);
      assert.strictEqual(res.body.data.counsellor.role, 'counsellor');
      assert.ok(typeof res.body.data.metrics.assigned_leads === 'number');
      assert.ok(typeof res.body.data.metrics.completed_leads === 'number');
    });

    it('should return 404 for nonexistent counsellor ID', async () => {
      await request(app)
        .get('/api/admin/users/counsellors/9999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('5. Status Management & Immediate Session Invalidation (PATCH /api/admin/users/counsellors/:id/status)', () => {
    it('should prevent self-deactivation when an admin tries to block their own account', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/counsellors/${adminUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'blocked' })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('cannot modify their own'));
    });

    it('should reject deactivation if target is an Admin or Super Admin', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/counsellors/${superAdminUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'blocked' })
        .expect(403);

      assert.strictEqual(res.body.success, false);
    });

    it('should deactivate counsellor, revoke all refresh tokens, and immediately block existing access token', async () => {
      const email = `deactivate_target_${testRunId}@test.com`;
      syntheticUsers.push(email);

      const [resIns] = await pool.query(
        "INSERT INTO users (name, email, role, status, email_verified) VALUES ('Deactivation Target', ?, 'counsellor', 'active', TRUE)",
        [email]
      );
      const targetId = resIns.insertId;

      // Create an active session with refresh token and access token
      const targetToken = generateAccessToken({ id: targetId, role: 'counsellor' });
      const rawRefreshToken = generateRefreshToken();
      const tokenHash = hashToken(rawRefreshToken);
      const expiresAt = new Date(Date.now() + 30 * 86400000);

      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [targetId, tokenHash, expiresAt]
      );

      // Verify that access token initially works
      const initialMe = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${targetToken}`)
        .expect(200);
      assert.strictEqual(initialMe.body.data.id, targetId);

      // Now Admin deactivates the counsellor
      const deactivateRes = await request(app)
        .patch(`/api/admin/users/counsellors/${targetId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'blocked' })
        .expect(200);

      assert.strictEqual(deactivateRes.body.success, true);
      assert.strictEqual(deactivateRes.body.data.counsellor.status, 'blocked');

      // CRITICAL ACCEPTANCE CRITERIA:
      // 1. Refresh token is revoked in database
      const [rtRows] = await pool.query('SELECT revoked_at FROM refresh_tokens WHERE user_id = ?', [targetId]);
      assert.ok(rtRows[0].revoked_at !== null, 'Refresh token must be revoked');

      // 2. Existing access token is IMMEDIATELY rejected (403 Forbidden)
      const blockedAccess = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${targetToken}`)
        .expect(403);
      assert.strictEqual(blockedAccess.body.success, false);
      assert.ok(blockedAccess.body.message.includes('inactive or blocked'));

      // 3. Counsellor protected API call with old token is also blocked
      await request(app)
        .get('/api/admin/demo-requests')
        .set('Authorization', `Bearer ${targetToken}`)
        .expect(403);

      // 4. Token refresh is rejected (401)
      await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${rawRefreshToken}`])
        .expect(401);

      // Reactivation allows new valid login
      await request(app)
        .patch(`/api/admin/users/counsellors/${targetId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' })
        .expect(200);

      const [reactivatedUser] = await pool.query('SELECT status FROM users WHERE id = ?', [targetId]);
      assert.strictEqual(reactivatedUser[0].status, 'active');

      // But previously revoked refresh token MUST REMAIN revoked
      const [stillRevoked] = await pool.query('SELECT revoked_at FROM refresh_tokens WHERE user_id = ?', [targetId]);
      assert.ok(stillRevoked[0].revoked_at !== null);
    });
  });

  describe('6. Authorization Security Boundaries', () => {
    it('should reject Student calling counsellor admin endpoints with 403 Forbidden', async () => {
      await request(app)
        .get('/api/admin/users/counsellors')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      await request(app)
        .post('/api/admin/users/counsellors')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ name: 'Hacker', email: 'hack@test.com' })
        .expect(403);
    });

    it('should reject Counsellor calling counsellor admin endpoints with 403 Forbidden', async () => {
      await request(app)
        .get('/api/admin/users/counsellors')
        .set('Authorization', `Bearer ${counsellorToken}`)
        .expect(403);

      await request(app)
        .post('/api/admin/users/counsellors/promote')
        .set('Authorization', `Bearer ${counsellorToken}`)
        .send({ email: studentUser.email })
        .expect(403);
    });
  });

  describe('7. First-Time Google OAuth Linking for Provisioned Counsellor', () => {
    it('should link google_id and preserve counsellor role on first login', async () => {
      const email = `oauth_counsellor_${testRunId}@test.com`;
      const googleId = `gid_counsellor_${testRunId}`;
      syntheticUsers.push(email);

      // Provision counsellor through the admin endpoint
      await request(app)
        .post('/api/admin/users/counsellors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Staff OAuth Target', email })
        .expect(201);

      // Mock Google OAuth claims
      setGoogleTokenVerifierForTesting(() => ({
        google_id: googleId,
        email,
        name: 'Staff OAuth Target From Google',
        avatar_url: 'https://lh3.googleusercontent.com/avatar',
        email_verified: true,
      }));

      // Counsellor performs first-time Google sign-in
      const loginRes = await request(app)
        .post('/api/auth/google')
        .send({ id_token: 'google_oauth_token' })
        .expect(200);

      assert.strictEqual(loginRes.body.data.user.role, 'counsellor', 'Role must remain counsellor');

      // Verify DB state: google_id linked, role preserved, email_verified now true via Google
      const [rows] = await pool.query('SELECT role, google_id, email_verified FROM users WHERE email = ?', [email]);
      assert.strictEqual(rows[0].role, 'counsellor');
      assert.strictEqual(rows[0].google_id, googleId);
      assert.strictEqual(rows[0].email_verified, 1);
    });
  });
});
