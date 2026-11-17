import { getPool } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';
import { createAuditLog } from '../../utils/auditLogger.js';
import {
  findCounsellorById,
  findUserByNormalizedEmail,
  listCounsellors as listCounsellorsRepo,
  getCounsellorLeadMetrics,
  insertCounsellor,
  updateCounsellorStatus as updateCounsellorStatusRepo,
  promoteUserToCounsellor as promoteUserToCounsellorRepo,
  revokeUserRefreshTokens,
} from './counsellor-admin.repository.js';

/**
 * Format counsellor record for API response
 */
export function formatCounsellorResponse(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    avatar_url: user.avatar_url || null,
    phone: user.phone || null,
    role: user.role,
    status: user.status,
    google_id_linked: Boolean(user.google_id_linked),
    email_verified: Boolean(user.email_verified),
    last_login_at: user.last_login_at || null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

/**
 * Provision a new Counsellor account (Pre-provisioned for first-time Google OAuth)
 */
export async function provisionCounsellor({ name, email, phone = null }, actor = {}, ipAddress = null) {
  const normalizedEmail = (email || '').trim().toLowerCase();

  // 1. Check for duplicate email
  const existingUser = await findUserByNormalizedEmail(normalizedEmail);
  if (existingUser) {
    if (existingUser.role === 'counsellor') {
      throw new AppError('A counsellor with this email already exists', 409);
    }
    if (existingUser.role === 'user') {
      throw new AppError(
        'A student account already exists with this email. Use the promotion workflow to upgrade this account to a counsellor.',
        409
      );
    }
    if (existingUser.role === 'admin' || existingUser.role === 'super_admin') {
      throw new AppError('An administrator account already exists with this email', 409);
    }
    throw new AppError('An account with this email already exists', 409);
  }

  // 2. Insert Counsellor within database transaction
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const created = await insertCounsellor(
      {
        name: name.trim(),
        email: normalizedEmail,
        phone: phone ? phone.trim() : null,
      },
      connection
    );

    // 3. Record audit log atomically
    await createAuditLog({
      actor_id: actor.id || null,
      action: 'counsellor.create',
      entity_type: 'user',
      entity_id: created.id,
      new_value: {
        id: created.id,
        name: created.name,
        email: created.email,
        role: 'counsellor',
        status: 'active',
      },
      ip_address: ipAddress,
      connection,
    });

    await connection.commit();
    return formatCounsellorResponse(created);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * List counsellors with filtering and pagination
 */
export async function listCounsellors({ page = 1, limit = 10, search = '', status = 'all' }) {
  const result = await listCounsellorsRepo({ page, limit, search, status });
  const totalPages = Math.ceil(result.total / limit) || 1;

  return {
    counsellors: result.counsellors.map(formatCounsellorResponse),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: result.total,
      totalPages,
    },
    summary: result.summary,
  };
}

/**
 * Fetch full details and lead metrics for a specific counsellor
 */
export async function getCounsellorDetails(counsellorId) {
  const counsellor = await findCounsellorById(counsellorId);
  if (!counsellor) {
    throw new AppError('Counsellor not found', 404);
  }

  // Fetch actual lead relationships from demo_requests table
  const metrics = await getCounsellorLeadMetrics(counsellorId);

  return {
    counsellor: formatCounsellorResponse(counsellor),
    metrics: {
      assigned_leads: metrics.assigned_leads,
      completed_leads: metrics.completed_leads,
    },
  };
}

/**
 * Update Counsellor account status (active | blocked) with immediate session revocation
 */
export async function updateCounsellorStatus(targetId, newStatus, actor = {}, ipAddress = null) {
  const targetUserId = Number(targetId);

  // Guard against self-deactivation
  if (actor.id && Number(actor.id) === targetUserId) {
    throw new AppError('Administrators cannot modify their own account status', 400);
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Lock user row for update and assert target is indeed a counsellor
    const [rows] = await connection.query(
      'SELECT id, name, email, role, status FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [targetUserId]
    );
    const user = rows[0];

    if (!user) {
      throw new AppError('Counsellor not found', 404);
    }

    if (user.role === 'admin' || user.role === 'super_admin') {
      throw new AppError('Cannot modify administrator accounts', 403);
    }

    if (user.role !== 'counsellor') {
      throw new AppError('Target user is not a counsellor', 400);
    }

    const previousStatus = user.status;

    // Update status if changed
    if (previousStatus !== newStatus) {
      await updateCounsellorStatusRepo(targetUserId, newStatus, connection);

      // When blocking, immediately revoke all active refresh tokens
      if (newStatus === 'blocked') {
        await revokeUserRefreshTokens(targetUserId, connection);
      }

      // Record audit log
      await createAuditLog({
        actor_id: actor.id || null,
        action: 'counsellor.status_update',
        entity_type: 'user',
        entity_id: targetUserId,
        old_value: { status: previousStatus },
        new_value: { status: newStatus },
        ip_address: ipAddress,
        connection,
      });
    }

    await connection.commit();

    const updated = await findCounsellorById(targetUserId);
    return formatCounsellorResponse(updated);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Promote an existing Student account to Counsellor
 */
export async function promoteStudentToCounsellor(email, actor = {}, ipAddress = null) {
  const normalizedEmail = (email || '').trim().toLowerCase();

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Lock user row for update
    const [rows] = await connection.query(
      'SELECT id, name, email, role, status FROM users WHERE email = ? AND deleted_at IS NULL FOR UPDATE',
      [normalizedEmail]
    );
    const user = rows[0];

    if (!user) {
      throw new AppError('No user account found with this email address', 404);
    }

    if (user.role === 'counsellor') {
      throw new AppError('User is already a counsellor', 400);
    }

    if (user.role === 'admin' || user.role === 'super_admin') {
      throw new AppError('Cannot promote administrator accounts', 403);
    }

    if (user.role !== 'user') {
      throw new AppError('Only student accounts can be promoted to counsellor', 400);
    }

    if (user.status === 'blocked') {
      throw new AppError('Cannot promote a suspended/blocked account. Unblock the user first.', 400);
    }

    await promoteUserToCounsellorRepo(user.id, connection);

    // Record audit log atomically
    await createAuditLog({
      actor_id: actor.id || null,
      action: 'counsellor.promote',
      entity_type: 'user',
      entity_id: user.id,
      old_value: { role: 'user' },
      new_value: { role: 'counsellor' },
      ip_address: ipAddress,
      connection,
    });

    await connection.commit();

    const updated = await findCounsellorById(user.id);
    return formatCounsellorResponse(updated);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export default {
  provisionCounsellor,
  listCounsellors,
  getCounsellorDetails,
  updateCounsellorStatus,
  promoteStudentToCounsellor,
};
