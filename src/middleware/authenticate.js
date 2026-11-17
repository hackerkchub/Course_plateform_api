import { verifyAccessToken } from '../utils/token.js';
import { sendError } from '../utils/response.js';
import { getPool } from '../config/db.js';

/**
 * Extracts access token from cookie or Authorization Bearer header
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractToken(req) {
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  return null;
}

/**
 * Middleware: Strictly requires authenticated user
 * Verifies JWT access token from cookie or Bearer header
 * Validates active account status against database for immediate session invalidation
 * Sets req.user = { id, role }
 */
export async function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return sendError(res, 'Authentication required', [], 401);
  }

  try {
    const payload = verifyAccessToken(token);
    const userId = Number(payload.id);

    // Verify account status in database for immediate session invalidation upon deactivation
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, role, status FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );
    const user = rows[0];

    if (!user || user.status === 'blocked') {
      return sendError(res, 'User account is inactive or blocked', [], 403);
    }

    req.user = {
      id: Number(user.id),
      role: user.role,
    };
    return next();
  } catch (error) {
    return sendError(res, 'Invalid or expired access token', [], 401);
  }
}

/**
 * Middleware: Optional authentication for public endpoints (Section 3 & 9.2)
 * If valid access token is present and account is active, sets req.user = { id, role }
 * Otherwise sets req.user = null and continues without error
 */
export async function optionalAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, role, status FROM users WHERE id = ? AND deleted_at IS NULL',
      [Number(payload.id)]
    );
    const user = rows[0];

    if (!user || user.status === 'blocked') {
      req.user = null;
    } else {
      req.user = {
        id: Number(user.id),
        role: user.role,
      };
    }
  } catch {
    req.user = null;
  }

  return next();
}

export default {
  authenticate,
  optionalAuth,
};
