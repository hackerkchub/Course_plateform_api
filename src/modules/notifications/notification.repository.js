import { getPool } from '../../config/db.js';

/**
 * Fetch notification settings for an event type
 */
export async function getSettingByEventType(eventType) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM notification_settings WHERE event_type = ?',
    [eventType]
  );
  return rows[0] || null;
}

/**
 * Fetch all notification settings
 */
export async function getAllSettings() {
  const pool = getPool();
  const [rows] = await pool.query('SELECT * FROM notification_settings ORDER BY id ASC');
  return rows;
}

/**
 * Update notification setting
 */
export async function updateSetting(eventType, updates) {
  const pool = getPool();
  const allowed = [
    'email_enabled',
    'whatsapp_enabled',
    'inapp_enabled',
    'notify_super_admin',
    'notify_counsellor',
    'notify_instructor',
    'notify_student',
  ];

  const fields = [];
  const params = [];
  for (const col of allowed) {
    if (updates[col] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(updates[col] ? 1 : 0);
    }
  }

  if (fields.length === 0) return getSettingByEventType(eventType);

  params.push(eventType);
  await pool.query(`UPDATE notification_settings SET ${fields.join(', ')} WHERE event_type = ?`, params);
  return getSettingByEventType(eventType);
}

/**
 * Queue a new notification (with idempotency support)
 */
export async function queueNotification({
  idempotency_key,
  user_id = null,
  type,
  event_type = null,
  event_id = null,
  template_name = null,
  channel,
  recipient,
  payload = null,
  max_retries = 3,
}) {
  const pool = getPool();
  const payloadStr = typeof payload === 'object' && payload !== null ? JSON.stringify(payload) : payload;

  const [result] = await pool.query(`
    INSERT INTO notifications
      (idempotency_key, user_id, type, event_type, event_id, template_name, channel, recipient, payload, status, max_retries)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)
    ON DUPLICATE KEY UPDATE updated_at = NOW()
  `, [
    idempotency_key || null,
    user_id || null,
    type,
    event_type || null,
    event_id ? String(event_id) : null,
    template_name || null,
    channel,
    recipient,
    payloadStr,
    max_retries,
  ]);

  if (result.insertId) {
    const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ?', [result.insertId]);
    return rows[0];
  }
  return null;
}

/**
 * Atomic CAS Claim for MariaDB 10.4.32 (which lacks SKIP LOCKED)
 * Step 1: Query IDs of candidates that are queued and ready
 * Step 2: Try atomic single-row UPDATE where status = 'queued'
 */
export async function claimQueuedNotifications(batchSize = 10) {
  const pool = getPool();

  // Find candidate IDs
  const [candidates] = await pool.query(`
    SELECT id FROM notifications
    WHERE status = 'queued' AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY id ASC
    LIMIT ?
  `, [batchSize]);

  if (candidates.length === 0) return [];

  const claimed = [];
  for (const c of candidates) {
    const [result] = await pool.query(`
      UPDATE notifications
      SET status = 'processing', updated_at = NOW()
      WHERE id = ? AND status = 'queued'
    `, [c.id]);

    if (result.affectedRows === 1) {
      const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ?', [c.id]);
      if (rows[0]) claimed.push(rows[0]);
    }
  }

  return claimed;
}

/**
 * Stale lease recovery for worker crash or hung requests
 * Recovers notifications stuck in 'processing' for > 5 minutes
 */
export async function recoverStaleProcessing(timeoutMinutes = 5) {
  const pool = getPool();
  const [result] = await pool.query(`
    UPDATE notifications
    SET status = 'queued', next_retry_at = NOW()
    WHERE status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
  `, [timeoutMinutes]);

  return result.affectedRows;
}

/**
 * Mark notification as successfully sent
 */
export async function markNotificationSent(id) {
  const pool = getPool();
  await pool.query(`
    UPDATE notifications
    SET status = 'sent', sent_at = NOW(), error_message = NULL, updated_at = NOW()
    WHERE id = ?
  `, [id]);
}

/**
 * Mark notification failure with exponential backoff retry scheduling
 */
export async function markNotificationFailed(id, errorMessage) {
  const pool = getPool();
  const [rows] = await pool.query('SELECT retry_count, max_retries FROM notifications WHERE id = ?', [id]);
  if (rows.length === 0) return;

  const currentRetry = Number(rows[0].retry_count || 0);
  const maxRetries = Number(rows[0].max_retries || 3);
  const nextRetryCount = currentRetry + 1;

  if (nextRetryCount < maxRetries) {
    // Exponential backoff: 2^retryCount * 60 seconds (1m, 2m, 4m...)
    const backoffSeconds = Math.pow(2, currentRetry) * 60;
    await pool.query(`
      UPDATE notifications
      SET status = 'queued',
          retry_count = ?,
          next_retry_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
          error_message = ?,
          updated_at = NOW()
      WHERE id = ?
    `, [nextRetryCount, backoffSeconds, errorMessage ? String(errorMessage).slice(0, 1000) : null, id]);
  } else {
    // Exceeded max retries -> permanent failed
    await pool.query(`
      UPDATE notifications
      SET status = 'failed',
          retry_count = ?,
          error_message = ?,
          updated_at = NOW()
      WHERE id = ?
    `, [nextRetryCount, errorMessage ? String(errorMessage).slice(0, 1000) : null, id]);
  }
}

/**
 * Manually retry a failed notification (Admin action)
 */
export async function retryNotification(id) {
  const pool = getPool();
  const [result] = await pool.query(`
    UPDATE notifications
    SET status = 'queued', next_retry_at = NOW(), error_message = NULL, updated_at = NOW()
    WHERE id = ? AND status = 'failed'
  `, [id]);
  return result.affectedRows > 0;
}

/**
 * Query delivery logs with filtering & pagination
 */
export async function getNotificationLogs({ channel, status, eventType, search, limit = 50, offset = 0 }) {
  const pool = getPool();
  const conditions = [];
  const params = [];

  if (channel && channel !== 'all') {
    conditions.push('channel = ?');
    params.push(channel);
  }
  if (status && status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (eventType && eventType !== 'all') {
    conditions.push('event_type = ?');
    params.push(eventType);
  }
  if (search) {
    conditions.push('(recipient LIKE ? OR idempotency_key LIKE ? OR error_message LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await pool.query(`
    SELECT COUNT(*) AS total FROM notifications ${whereClause}
  `, params);

  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(`
    SELECT id, idempotency_key, user_id, type, event_type, event_id, template_name,
           channel, recipient, payload, status, retry_count, max_retries, sent_at,
           next_retry_at, error_message, created_at, updated_at
    FROM notifications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  return {
    logs: rows.map(r => ({
      ...r,
      id: Number(r.id),
      user_id: r.user_id ? Number(r.user_id) : null,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload || '{}') : r.payload,
    })),
    total,
  };
}

/**
 * Check WhatsApp consent for a phone number
 */
export async function getWhatsAppConsent(phone) {
  const pool = getPool();
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  const [rows] = await pool.query(
    'SELECT * FROM whatsapp_consents WHERE phone = ?',
    [cleanPhone]
  );
  return rows[0] || null;
}

/**
 * Record WhatsApp opt-in consent
 */
export async function recordWhatsAppConsent({ phone, user_id, source = 'web_form', evidence, ip }) {
  const pool = getPool();
  const cleanPhone = phone.replace(/[^0-9+]/g, '');

  await pool.query(`
    INSERT INTO whatsapp_consents
      (phone, user_id, status, consent_source, consent_evidence, consent_ip, consent_at)
    VALUES (?, ?, 'opted_in', ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      status = 'opted_in',
      user_id = COALESCE(VALUES(user_id), user_id),
      consent_source = VALUES(consent_source),
      consent_evidence = VALUES(consent_evidence),
      consent_ip = VALUES(consent_ip),
      consent_at = NOW(),
      opt_out_at = NULL,
      opt_out_source = NULL,
      opt_out_reason = NULL,
      updated_at = NOW()
  `, [cleanPhone, user_id || null, source, evidence || null, ip || null]);

  return getWhatsAppConsent(cleanPhone);
}

/**
 * Record WhatsApp opt-out
 */
export async function recordWhatsAppOptOut({ phone, source = 'user_action', reason }) {
  const pool = getPool();
  const cleanPhone = phone.replace(/[^0-9+]/g, '');

  await pool.query(`
    UPDATE whatsapp_consents
    SET status = 'opted_out',
        opt_out_at = NOW(),
        opt_out_source = ?,
        opt_out_reason = ?,
        updated_at = NOW()
    WHERE phone = ?
  `, [source, reason || null, cleanPhone]);

  return getWhatsAppConsent(cleanPhone);
}

/**
 * Fetch staff users for notification recipient resolution
 */
export async function getStaffRecipients(roles = ['super_admin', 'admin', 'counsellor']) {
  const pool = getPool();
  const placeholders = roles.map(() => '?').join(',');
  const [rows] = await pool.query(`
    SELECT id, name, email, phone, role
    FROM users
    WHERE role IN (${placeholders}) AND status = 'active'
  `, roles);

  return rows.map(r => ({
    ...r,
    id: Number(r.id),
  }));
}

/**
 * Fetch course instructors for recipient resolution
 */
export async function getCourseInstructorRecipients(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT i.id AS instructor_id, i.name, i.email, u.phone, u.id AS user_id
    FROM course_instructors ci
    JOIN instructors i ON i.id = ci.instructor_id
    LEFT JOIN users u ON u.id = i.user_id
    WHERE ci.course_id = ? AND i.status = 'active'
  `, [courseId]);

  return rows;
}

export default {
  getSettingByEventType,
  getAllSettings,
  updateSetting,
  queueNotification,
  claimQueuedNotifications,
  recoverStaleProcessing,
  markNotificationSent,
  markNotificationFailed,
  retryNotification,
  getNotificationLogs,
  getWhatsAppConsent,
  recordWhatsAppConsent,
  recordWhatsAppOptOut,
  getStaffRecipients,
  getCourseInstructorRecipients,
};
