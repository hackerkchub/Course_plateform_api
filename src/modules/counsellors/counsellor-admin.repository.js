import { getPool } from '../../config/db.js';

export async function findCounsellorById(id, connection = null) {
  const db = connection || getPool();
  const [rows] = await db.query(
    `SELECT id, name, email, avatar_url, phone, role, status, 
            (google_id IS NOT NULL) AS google_id_linked,
            email_verified, last_login_at, created_at, updated_at 
     FROM users 
     WHERE id = ? AND role = 'counsellor' AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] || null;
}

export async function findUserByNormalizedEmail(email, connection = null) {
  const db = connection || getPool();
  const [rows] = await db.query(
    `SELECT id, name, email, avatar_url, phone, role, status, google_id, email_verified, created_at 
     FROM users 
     WHERE email = ? AND deleted_at IS NULL`,
    [email]
  );
  return rows[0] || null;
}

export async function listCounsellors({ page = 1, limit = 10, search = '', status = 'all' }) {
  const pool = getPool();
  const offset = (page - 1) * limit;

  const whereConditions = ["role = 'counsellor'", 'deleted_at IS NULL'];
  const params = [];

  if (status && status !== 'all') {
    whereConditions.push('status = ?');
    params.push(status);
  }

  if (search && search.trim()) {
    whereConditions.push('(name LIKE ? OR email LIKE ?)');
    const searchTerm = `%${search.trim()}%`;
    params.push(searchTerm, searchTerm);
  }

  const whereClause = whereConditions.join(' AND ');

  // Fetch filtered paginated records
  const listParams = [...params, limit, offset];
  const [counsellors] = await pool.query(
    `SELECT id, name, email, avatar_url, phone, role, status,
            (google_id IS NOT NULL) AS google_id_linked,
            email_verified, last_login_at, created_at, updated_at
     FROM users
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    listParams
  );

  // Fetch total filtered count
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM users WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  // Fetch overall summary counts for Counsellors (independent of search/status filters)
  const [summaryRows] = await pool.query(
    `SELECT 
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
       SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked_count,
       SUM(CASE WHEN google_id IS NOT NULL THEN 1 ELSE 0 END) AS google_linked_count
     FROM users 
     WHERE role = 'counsellor' AND deleted_at IS NULL`
  );

  const summary = {
    total: Number(summaryRows[0]?.total || 0),
    active: Number(summaryRows[0]?.active_count || 0),
    blocked: Number(summaryRows[0]?.blocked_count || 0),
    google_linked: Number(summaryRows[0]?.google_linked_count || 0),
  };

  return {
    counsellors,
    total,
    summary,
  };
}

export async function getCounsellorLeadMetrics(counsellorId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT 
       COUNT(*) AS assigned_leads,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_leads
     FROM demo_requests 
     WHERE assigned_to = ? AND deleted_at IS NULL`,
    [counsellorId]
  );

  return {
    assigned_leads: Number(rows[0]?.assigned_leads || 0),
    completed_leads: Number(rows[0]?.completed_leads || 0),
  };
}

export async function insertCounsellor({ name, email, phone = null }, connection = null) {
  const db = connection || getPool();
  const [result] = await db.query(
    `INSERT INTO users (name, email, phone, role, status, email_verified, google_id) 
     VALUES (?, ?, ?, 'counsellor', 'active', FALSE, NULL)`,
    [name, email, phone || null]
  );

  return findCounsellorById(result.insertId, db);
}

export async function updateCounsellorStatus(id, status, connection = null) {
  const db = connection || getPool();
  await db.query(
    `UPDATE users SET status = ? WHERE id = ? AND role = 'counsellor' AND deleted_at IS NULL`,
    [status, id]
  );
  return findCounsellorById(id, db);
}

export async function promoteUserToCounsellor(id, connection = null) {
  const db = connection || getPool();
  await db.query(
    `UPDATE users SET role = 'counsellor' WHERE id = ? AND role = 'user' AND deleted_at IS NULL`,
    [id]
  );
  return findCounsellorById(id, db);
}

export async function revokeUserRefreshTokens(userId, connection = null) {
  const db = connection || getPool();
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
}

export default {
  findCounsellorById,
  findUserByNormalizedEmail,
  listCounsellors,
  getCounsellorLeadMetrics,
  insertCounsellor,
  updateCounsellorStatus,
  promoteUserToCounsellor,
  revokeUserRefreshTokens,
};
