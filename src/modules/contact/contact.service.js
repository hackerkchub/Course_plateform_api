import * as repo from './contact.repository.js';
import { logAudit } from '../../middleware/audit.js';
import { emitNotificationEvent } from '../notifications/notification.events.js';

export class NotFoundError extends Error {
  constructor(message = 'Contact inquiry not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export class RateLimitError extends Error {
  constructor(message = 'Too many submissions. Please wait a few minutes before trying again.') {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
  }
}

export async function submitContact(data, reqContext = {}) {
  const ip = reqContext.ip;
  if (ip) {
    const recentCount = await repo.countRecentSubmissionsByIp(ip, 15);
    if (recentCount >= 5) {
      throw new RateLimitError();
    }
  }

  const record = await repo.createContactMessage({
    name: data.name,
    email: data.email,
    phone: data.phone,
    subject: data.subject,
    message: data.message,
    ip_address: ip,
  });

  // Emit event asynchronously - non-blocking
  emitNotificationEvent('contact_query_received', {
    contact_id: record.id,
    name: record.name,
    email: record.email,
    phone: record.phone,
    subject: record.subject,
    message: record.message,
  }).catch((err) => {
    console.error('[Notification Event Error] contact_query_received:', err.message);
  });

  return {
    success: true,
    message: 'Thank you for reaching out! Our team will get back to you shortly.',
    reference_id: record.id,
  };
}

export async function listContacts(query) {
  return repo.findContactMessages({
    status: query.status,
    assignedTo: query.assigned_to,
    search: query.search,
    limit: query.limit ? Number(query.limit) : 20,
    offset: query.offset ? Number(query.offset) : 0,
  });
}

export async function getContactById(id) {
  const contact = await repo.findContactById(id);
  if (!contact) throw new NotFoundError();
  return contact;
}

export async function updateContactStatus(id, data, adminUserId, reqContext = {}) {
  const existing = await repo.findContactById(id);
  if (!existing) throw new NotFoundError();

  const updated = await repo.updateContactStatus(id, data);

  await logAudit({
    user_id: adminUserId,
    action: 'CONTACT_STATUS_UPDATE',
    resource_type: 'contact_messages',
    resource_id: id,
    old_values: { status: existing.status, admin_notes: existing.admin_notes },
    new_values: data,
    ip_address: reqContext.ip,
    user_agent: reqContext.userAgent,
  }).catch(() => {});

  return updated;
}

export async function assignContact(id, assignedTo, adminUserId, reqContext = {}) {
  const existing = await repo.findContactById(id);
  if (!existing) throw new NotFoundError();

  const updated = await repo.assignContact(id, assignedTo);

  await logAudit({
    user_id: adminUserId,
    action: 'CONTACT_ASSIGNMENT_UPDATE',
    resource_type: 'contact_messages',
    resource_id: id,
    old_values: { assigned_to: existing.assigned_to },
    new_values: { assigned_to: assignedTo },
    ip_address: reqContext.ip,
    user_agent: reqContext.userAgent,
  }).catch(() => {});

  return updated;
}

export default {
  submitContact,
  listContacts,
  getContactById,
  updateContactStatus,
  assignContact,
};
