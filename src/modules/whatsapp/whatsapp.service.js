import { AppError } from '../../middleware/errorHandler.js';
import repo from './whatsapp.repository.js';
import { getPool } from '../../config/db.js';

export const DEFAULT_MESSAGE_TEMPLATE = 'Hi SoftMax Admissions, I would like more information about {{course_name}} (Code: {{course_code}}). Link: {{course_url}}';

/**
 * Normalizes phone numbers for click-to-chat links into E.164 digits-only format without leading '+'.
 * Validates Indian 10-digit mobile prefix (starts with 6-9).
 *
 * @param {string} phone
 * @param {string} countryCode
 * @returns {string} E.164 digits-only string (e.g. "919876543210")
 */
export function normalizePhoneNumber(phone, countryCode = '+91') {
  if (!phone || typeof phone !== 'string') {
    throw new AppError('Phone number is required and must be a string.', 400);
  }

  const cleanCode = (countryCode || '+91').replace(/\D/g, '');
  const cleanPhone = phone.replace(/\D/g, '');

  if (!cleanPhone) {
    throw new AppError('Phone number must contain at least one digit.', 400);
  }

  // Handle Indian Numbers (+91)
  if (cleanCode === '91') {
    if (cleanPhone.length === 10) {
      if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        throw new AppError('Invalid Indian mobile number. Must be a 10-digit number starting with 6, 7, 8, or 9.', 400);
      }
      return `91${cleanPhone}`;
    }

    if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
      const tenDigit = cleanPhone.slice(1);
      if (!/^[6-9]\d{9}$/.test(tenDigit)) {
        throw new AppError('Invalid Indian mobile number. Must be a 10-digit number starting with 6, 7, 8, or 9.', 400);
      }
      return `91${tenDigit}`;
    }

    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      const tenDigit = cleanPhone.slice(2);
      if (!/^[6-9]\d{9}$/.test(tenDigit)) {
        throw new AppError('Invalid Indian mobile number. Must be a 10-digit number starting with 6, 7, 8, or 9.', 400);
      }
      return cleanPhone;
    }

    throw new AppError('Invalid Indian phone number format. Please provide a 10-digit mobile number.', 400);
  }

  // Handle International Numbers
  let normalized = cleanPhone;
  if (!normalized.startsWith(cleanCode)) {
    normalized = `${cleanCode}${cleanPhone}`;
  }

  if (normalized.length < 8 || normalized.length > 15) {
    throw new AppError('Invalid international phone number length (must be between 8 and 15 digits).', 400);
  }

  return normalized;
}

/**
 * Interpolates variables in message template
 *
 * @param {string|null} template
 * @param {{ courseName?: string, courseCode?: string, courseUrl?: string }} vars
 * @returns {string}
 */
export function interpolateWhatsAppMessage(template, vars = {}) {
  const tpl = (template && template.trim()) || DEFAULT_MESSAGE_TEMPLATE;
  const courseName = vars.courseName || 'our courses';
  const courseCode = vars.courseCode || '';
  const courseUrl = vars.courseUrl || 'https://softmaxs.com';

  return tpl
    .replace(/\{\{\s*course_name\s*\}\}/g, courseName)
    .replace(/\{\{\s*course_code\s*\}\}/g, courseCode)
    .replace(/\{\{\s*course_url\s*\}\}/g, courseUrl)
    .trim();
}

/**
 * Generates public wa.me click-to-chat URL
 *
 * @param {string} normalizedPhone
 * @param {string} message
 * @returns {string}
 */
export function buildClickToChatUrl(normalizedPhone, message) {
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

export async function listContacts(query) {
  return repo.listContacts(query);
}

export async function getContactById(id) {
  const contact = await repo.getContactById(id);
  if (!contact) {
    throw new AppError('WhatsApp contact not found', 404);
  }
  return contact;
}

export async function createContact(data, userId) {
  const normalizedPhone = normalizePhoneNumber(data.phone_number, data.country_code || '+91');

  const newId = await repo.createContact(
    {
      ...data,
      normalized_phone: normalizedPhone,
    },
    userId
  );

  return repo.getContactById(newId);
}

export async function updateContact(id, data, userId) {
  const existing = await repo.getContactById(id);
  if (!existing) {
    throw new AppError('WhatsApp contact not found', 404);
  }

  const updatePayload = { ...data };

  // Re-normalize phone if either phone_number or country_code is updated
  if (data.phone_number !== undefined || data.country_code !== undefined) {
    const phoneToUse = data.phone_number !== undefined ? data.phone_number : existing.phone_number;
    const countryCodeToUse = data.country_code !== undefined ? data.country_code : existing.country_code;
    updatePayload.normalized_phone = normalizePhoneNumber(phoneToUse, countryCodeToUse);
  }

  // Safety: If un-setting default, ensure another default exists
  if (data.is_default === false && existing.is_default) {
    throw new AppError('Cannot unset default status directly. Please designate another contact as default instead.', 400);
  }

  await repo.updateContact(id, updatePayload, userId);
  return repo.getContactById(id);
}

export async function setDefaultContact(id, userId) {
  const existing = await repo.getContactById(id);
  if (!existing) {
    throw new AppError('WhatsApp contact not found', 404);
  }

  if (!existing.is_active) {
    throw new AppError('Cannot set an inactive contact as default. Please activate the contact first.', 400);
  }

  await repo.setDefaultContact(id, userId);
  return repo.getContactById(id);
}

export async function toggleContactStatus(id, isActive, userId) {
  const existing = await repo.getContactById(id);
  if (!existing) {
    throw new AppError('WhatsApp contact not found', 404);
  }

  if (!isActive && existing.is_default) {
    throw new AppError('Cannot deactivate the default WhatsApp contact. Please designate another active contact as default first.', 400);
  }

  await repo.updateContactStatus(id, isActive, userId);
  return repo.getContactById(id);
}

export async function deleteContact(id, userId) {
  const existing = await repo.getContactById(id);
  if (!existing) {
    throw new AppError('WhatsApp contact not found', 404);
  }

  if (existing.is_default) {
    throw new AppError('Cannot delete the default WhatsApp contact. Please designate another contact as default first.', 400);
  }

  await repo.softDeleteContact(id, userId);
  return true;
}

export async function generatePreview(id, { courseId = null, customMessage = null }) {
  const contact = await repo.getContactById(id);
  if (!contact) {
    throw new AppError('WhatsApp contact not found', 404);
  }

  let courseVars = {
    courseName: 'Full Stack Developer with MERN Stack',
    courseCode: 'FSD-MERN-001',
    courseUrl: 'https://softmaxs.com/courses/full-stack-developer-with-mern-stack',
  };

  if (courseId) {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, course_name, course_code, slug FROM courses WHERE id = ? AND deleted_at IS NULL',
      [courseId]
    );
    if (rows.length > 0) {
      courseVars = {
        courseName: rows[0].course_name,
        courseCode: rows[0].course_code,
        courseUrl: `https://softmaxs.com/courses/${rows[0].slug}`,
      };
    }
  }

  const templateToUse = customMessage || contact.custom_message_template || DEFAULT_MESSAGE_TEMPLATE;
  const interpolatedMessage = interpolateWhatsAppMessage(templateToUse, courseVars);
  const clickToChatUrl = buildClickToChatUrl(contact.normalized_phone, interpolatedMessage);

  return {
    contact_id: contact.id,
    display_name: contact.display_name,
    department: contact.department,
    normalized_phone: contact.normalized_phone,
    interpolated_message: interpolatedMessage,
    click_to_chat_url: clickToChatUrl,
  };
}

export default {
  DEFAULT_MESSAGE_TEMPLATE,
  normalizePhoneNumber,
  interpolateWhatsAppMessage,
  buildClickToChatUrl,
  listContacts,
  getContactById,
  createContact,
  updateContact,
  setDefaultContact,
  toggleContactStatus,
  deleteContact,
  generatePreview,
};
