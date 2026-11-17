import { getPool } from '../../config/db.js';

export async function listContacts({ search, department, is_active, page = 1, limit = 50 }) {
  const pool = getPool();
  const offset = (page - 1) * limit;

  const conditions = ['wc.deleted_at IS NULL'];
  const params = [];

  if (search) {
    conditions.push('(wc.display_name LIKE ? OR wc.phone_number LIKE ? OR wc.normalized_phone LIKE ?)');
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (department) {
    conditions.push('wc.department = ?');
    params.push(department);
  }

  if (is_active !== undefined) {
    const activeVal = is_active === 'true' || is_active === '1' ? 1 : 0;
    conditions.push('wc.is_active = ?');
    params.push(activeVal);
  }

  const whereClause = conditions.join(' AND ');

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM whatsapp_contacts wc WHERE ${whereClause}`,
    params
  );
  const total = countRows[0]?.total || 0;

  const [rows] = await pool.query(
    `SELECT 
       wc.*,
       (SELECT COUNT(*) FROM courses c WHERE c.whatsapp_contact_id = wc.id AND c.deleted_at IS NULL) AS assigned_courses_count,
       u1.name AS created_by_name,
       u2.name AS updated_by_name
     FROM whatsapp_contacts wc
     LEFT JOIN users u1 ON u1.id = wc.created_by
     LEFT JOIN users u2 ON u2.id = wc.updated_by
     WHERE ${whereClause}
     ORDER BY wc.is_default DESC, wc.is_active DESC, wc.display_name ASC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );

  return {
    contacts: rows.map(r => ({
      id: Number(r.id),
      display_name: r.display_name,
      department: r.department,
      country_code: r.country_code,
      phone_number: r.phone_number,
      normalized_phone: r.normalized_phone,
      is_active: Boolean(r.is_active),
      is_default: Boolean(r.is_default),
      custom_message_template: r.custom_message_template,
      notes: r.notes,
      assigned_courses_count: Number(r.assigned_courses_count || 0),
      created_by: r.created_by ? Number(r.created_by) : null,
      created_by_name: r.created_by_name || null,
      updated_by: r.updated_by ? Number(r.updated_by) : null,
      updated_by_name: r.updated_by_name || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
    total,
    page: Number(page),
    limit: Number(limit),
  };
}

export async function getContactById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT 
       wc.*,
       (SELECT COUNT(*) FROM courses c WHERE c.whatsapp_contact_id = wc.id AND c.deleted_at IS NULL) AS assigned_courses_count,
       u1.name AS created_by_name,
       u2.name AS updated_by_name
     FROM whatsapp_contacts wc
     LEFT JOIN users u1 ON u1.id = wc.created_by
     LEFT JOIN users u2 ON u2.id = wc.updated_by
     WHERE wc.id = ? AND wc.deleted_at IS NULL`,
    [id]
  );

  if (rows.length === 0) return null;
  const r = rows[0];

  return {
    id: Number(r.id),
    display_name: r.display_name,
    department: r.department,
    country_code: r.country_code,
    phone_number: r.phone_number,
    normalized_phone: r.normalized_phone,
    is_active: Boolean(r.is_active),
    is_default: Boolean(r.is_default),
    custom_message_template: r.custom_message_template,
    notes: r.notes,
    assigned_courses_count: Number(r.assigned_courses_count || 0),
    created_by: r.created_by ? Number(r.created_by) : null,
    created_by_name: r.created_by_name || null,
    updated_by: r.updated_by ? Number(r.updated_by) : null,
    updated_by_name: r.updated_by_name || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function getDefaultContact() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT * FROM whatsapp_contacts 
     WHERE is_default = 1 AND is_active = 1 AND deleted_at IS NULL 
     LIMIT 1`
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    ...r,
    id: Number(r.id),
    is_active: Boolean(r.is_active),
    is_default: Boolean(r.is_default),
  };
}

export async function countActiveContacts() {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM whatsapp_contacts WHERE is_active = 1 AND deleted_at IS NULL'
  );
  return Number(rows[0]?.total || 0);
}

export async function createContact(data, userId = null) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check if there is currently any active contact
    const [existingCountRows] = await connection.query(
      'SELECT COUNT(*) AS count FROM whatsapp_contacts WHERE deleted_at IS NULL'
    );
    const hasExisting = Number(existingCountRows[0]?.count || 0) > 0;

    // If marked as default or is the very first contact, enforce default
    const shouldBeDefault = data.is_default || !hasExisting;

    if (shouldBeDefault) {
      await connection.query('UPDATE whatsapp_contacts SET is_default = 0 WHERE is_default = 1');
    }

    const [result] = await connection.query(
      `INSERT INTO whatsapp_contacts (
        display_name, department, country_code, phone_number, normalized_phone,
        is_active, is_default, custom_message_template, notes, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.display_name,
        data.department || 'admissions',
        data.country_code || '+91',
        data.phone_number,
        data.normalized_phone,
        data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
        shouldBeDefault ? 1 : 0,
        data.custom_message_template || null,
        data.notes || null,
        userId,
        userId,
      ]
    );

    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateContact(id, data, userId = null) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (data.is_default === true) {
      await connection.query(
        'UPDATE whatsapp_contacts SET is_default = 0 WHERE is_default = 1 AND id != ?',
        [id]
      );
    }

    const fields = [];
    const params = [];

    const allowedFields = [
      'display_name', 'department', 'country_code', 'phone_number',
      'normalized_phone', 'is_active', 'is_default', 'custom_message_template', 'notes'
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        if (field === 'is_active' || field === 'is_default') {
          fields.push(`${field} = ?`);
          params.push(data[field] ? 1 : 0);
        } else {
          fields.push(`${field} = ?`);
          params.push(data[field]);
        }
      }
    }

    fields.push('updated_by = ?');
    params.push(userId);

    params.push(id);

    await connection.query(
      `UPDATE whatsapp_contacts SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      params
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function setDefaultContact(id, userId = null) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query('UPDATE whatsapp_contacts SET is_default = 0 WHERE is_default = 1');
    const [result] = await connection.query(
      'UPDATE whatsapp_contacts SET is_default = 1, is_active = 1, updated_by = ? WHERE id = ? AND deleted_at IS NULL',
      [userId, id]
    );

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateContactStatus(id, isActive, userId = null) {
  const pool = getPool();
  const [result] = await pool.query(
    'UPDATE whatsapp_contacts SET is_active = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL',
    [isActive ? 1 : 0, userId, id]
  );
  return result.affectedRows > 0;
}

export async function softDeleteContact(id, userId = null) {
  const pool = getPool();
  const [result] = await pool.query(
    'UPDATE whatsapp_contacts SET deleted_at = NOW(), is_active = 0, is_default = 0, updated_by = ? WHERE id = ? AND deleted_at IS NULL',
    [userId, id]
  );
  return result.affectedRows > 0;
}

export async function resolveContactForCourse(courseContactId) {
  const pool = getPool();

  if (courseContactId) {
    const [courseRows] = await pool.query(
      'SELECT * FROM whatsapp_contacts WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1',
      [courseContactId]
    );
    if (courseRows.length > 0) {
      return {
        ...courseRows[0],
        id: Number(courseRows[0].id),
        is_active: Boolean(courseRows[0].is_active),
        is_default: Boolean(courseRows[0].is_default),
      };
    }
  }

  // Fallback to active default contact
  const [defaultRows] = await pool.query(
    'SELECT * FROM whatsapp_contacts WHERE is_default = 1 AND is_active = 1 AND deleted_at IS NULL LIMIT 1'
  );

  if (defaultRows.length > 0) {
    return {
      ...defaultRows[0],
      id: Number(defaultRows[0].id),
      is_active: Boolean(defaultRows[0].is_active),
      is_default: Boolean(defaultRows[0].is_default),
    };
  }

  return null;
}

export default {
  listContacts,
  getContactById,
  getDefaultContact,
  countActiveContacts,
  createContact,
  updateContact,
  setDefaultContact,
  updateContactStatus,
  softDeleteContact,
  resolveContactForCourse,
};
