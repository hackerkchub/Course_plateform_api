import { getPool } from '../../config/db.js';

export async function createContactMessage(data) {
  const pool = getPool();
  const [result] = await pool.query(`
    INSERT INTO contact_messages (name, email, phone, subject, message, status, ip_address)
    VALUES (?, ?, ?, ?, ?, 'new', ?)
  `, [
    data.name,
    data.email,
    data.phone,
    data.subject,
    data.message,
    data.ip_address || null,
  ]);

  const [rows] = await pool.query('SELECT * FROM contact_messages WHERE id = ?', [result.insertId]);
  return rows[0];
}

export async function findContactById(id) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT cm.*, u.name AS assigned_to_name, u.email AS assigned_to_email
    FROM contact_messages cm
    LEFT JOIN users u ON u.id = cm.assigned_to
    WHERE cm.id = ?
  `, [id]);
  return rows[0] || null;
}

export async function findContactMessages({ status, assignedTo, search, limit = 20, offset = 0 }) {
  const pool = getPool();
  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    conditions.push('cm.status = ?');
    params.push(status);
  }

  if (assignedTo !== undefined) {
    if (assignedTo === 'unassigned') {
      conditions.push('cm.assigned_to IS NULL');
    } else if (assignedTo) {
      conditions.push('cm.assigned_to = ?');
      params.push(assignedTo);
    }
  }

  if (search) {
    conditions.push('(cm.name LIKE ? OR cm.email LIKE ? OR cm.phone LIKE ? OR cm.subject LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM contact_messages cm
    ${whereClause}
  `, params);

  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(`
    SELECT cm.*, u.name AS assigned_to_name, u.email AS assigned_to_email
    FROM contact_messages cm
    LEFT JOIN users u ON u.id = cm.assigned_to
    ${whereClause}
    ORDER BY cm.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  return {
    contacts: rows.map(r => ({
      ...r,
      id: Number(r.id),
      assigned_to: r.assigned_to ? Number(r.assigned_to) : null,
    })),
    total,
  };
}

export async function updateContactStatus(id, { status, admin_notes }) {
  const pool = getPool();
  const fields = ['status = ?'];
  const params = [status];

  if (admin_notes !== undefined) {
    fields.push('admin_notes = ?');
    params.push(admin_notes);
  }

  params.push(id);
  await pool.query(`UPDATE contact_messages SET ${fields.join(', ')} WHERE id = ?`, params);
  return findContactById(id);
}

export async function assignContact(id, assignedTo) {
  const pool = getPool();
  await pool.query('UPDATE contact_messages SET assigned_to = ? WHERE id = ?', [assignedTo, id]);
  return findContactById(id);
}

export async function countRecentSubmissionsByIp(ipAddress, windowMinutes = 15) {
  if (!ipAddress) return 0;
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT COUNT(*) AS count
    FROM contact_messages
    WHERE ip_address = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
  `, [ipAddress, windowMinutes]);
  return Number(rows[0]?.count || 0);
}

export default {
  createContactMessage,
  findContactById,
  findContactMessages,
  updateContactStatus,
  assignContact,
  countRecentSubmissionsByIp,
};
