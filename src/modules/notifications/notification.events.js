import repo from './notification.repository.js';

/**
 * Format email & WhatsApp messages for the 7 business events
 */
function buildNotificationPayload(eventType, eventData, recipientType) {
  const brand = 'SoftMaxs Course Platform';
  let subject = '';
  let html = '';
  let text = '';
  let templateName = null;

  switch (eventType) {
    case 'contact_query_received':
      subject = `[New Contact Query] ${eventData.subject || 'Inquiry'}`;
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #2563eb;">New Contact Message Received</h2>
          <p><strong>Name:</strong> ${eventData.name}</p>
          <p><strong>Email:</strong> ${eventData.email}</p>
          <p><strong>Phone:</strong> ${eventData.phone || 'N/A'}</p>
          <p><strong>Subject:</strong> ${eventData.subject}</p>
          <blockquote style="background: #f3f4f6; padding: 12px; border-left: 4px solid #2563eb;">
            ${eventData.message}
          </blockquote>
          <p style="font-size: 12px; color: #6b7280;">Sent via ${brand}</p>
        </div>
      `;
      text = `New Contact Query:\nName: ${eventData.name}\nEmail: ${eventData.email}\nPhone: ${eventData.phone || 'N/A'}\nSubject: ${eventData.subject}\n\nMessage:\n${eventData.message}`;
      templateName = 'contact_query_alert';
      break;

    case 'course_inquiry_received':
      subject = `[Course Inquiry] ${eventData.course_name || 'Course'}`;
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #2563eb;">New Course Inquiry</h2>
          <p><strong>Student:</strong> ${eventData.name}</p>
          <p><strong>Course:</strong> ${eventData.course_name}</p>
          <p><strong>Phone:</strong> ${eventData.phone}</p>
          <p><strong>Email:</strong> ${eventData.email}</p>
          ${eventData.message ? `<p><strong>Note:</strong> ${eventData.message}</p>` : ''}
          <p style="font-size: 12px; color: #6b7280;">Sent via ${brand}</p>
        </div>
      `;
      text = `New Course Inquiry:\nStudent: ${eventData.name}\nCourse: ${eventData.course_name}\nPhone: ${eventData.phone}\nEmail: ${eventData.email}`;
      templateName = 'course_inquiry_alert';
      break;

    case 'course_booking_created':
      subject = `Enrollment Confirmed: ${eventData.course_name}`;
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #16a34a;">Enrollment Confirmation</h2>
          <p>Dear ${eventData.student_name || 'Learner'},</p>
          <p>Congratulations! Your enrollment in <strong>${eventData.course_name}</strong> has been confirmed.</p>
          ${eventData.batch_name ? `<p><strong>Batch:</strong> ${eventData.batch_name}</p>` : ''}
          <p>You can now access your course dashboard and study materials.</p>
          <p style="font-size: 12px; color: #6b7280;">Best regards,<br>${brand} Team</p>
        </div>
      `;
      text = `Enrollment Confirmed!\nCourse: ${eventData.course_name}\nBatch: ${eventData.batch_name || 'N/A'}\nWelcome to ${brand}!`;
      templateName = 'course_enrollment_confirmation';
      break;

    case 'course_booking_cancelled':
      subject = `Enrollment Cancelled: ${eventData.course_name}`;
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #dc2626;">Enrollment Cancellation</h2>
          <p>Dear ${eventData.student_name || 'Learner'},</p>
          <p>Your enrollment in <strong>${eventData.course_name}</strong> has been cancelled.</p>
          ${eventData.reason ? `<p><strong>Reason:</strong> ${eventData.reason}</p>` : ''}
          <p>If you have any questions, please contact our support team.</p>
          <p style="font-size: 12px; color: #6b7280;">Best regards,<br>${brand} Team</p>
        </div>
      `;
      text = `Enrollment Cancelled for ${eventData.course_name}.\nReason: ${eventData.reason || 'Requested'}\nContact support if you need assistance.`;
      templateName = 'course_enrollment_cancellation';
      break;

    case 'demo_booking_created':
      subject = `Demo Class Scheduled: ${eventData.course_name}`;
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #2563eb;">Demo Session Scheduled</h2>
          <p>Dear ${eventData.student_name || 'Learner'},</p>
          <p>Your demo class for <strong>${eventData.course_name}</strong> has been booked successfully.</p>
          <p><strong>Date:</strong> ${eventData.demo_date || 'Upcoming'}</p>
          <p><strong>Time:</strong> ${eventData.demo_time || 'TBD'}</p>
          <p style="font-size: 12px; color: #6b7280;">We look forward to meeting you!<br>${brand} Team</p>
        </div>
      `;
      text = `Demo Class Scheduled!\nCourse: ${eventData.course_name}\nDate: ${eventData.demo_date || 'Upcoming'}\nTime: ${eventData.demo_time || 'TBD'}`;
      templateName = 'demo_booking_confirmation';
      break;

    case 'demo_booking_rescheduled':
      subject = `Demo Class Rescheduled: ${eventData.course_name}`;
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #f59e0b;">Demo Session Rescheduled</h2>
          <p>Dear ${eventData.student_name || 'Learner'},</p>
          <p>Your demo class for <strong>${eventData.course_name}</strong> has been rescheduled.</p>
          <p><strong>New Date:</strong> ${eventData.demo_date}</p>
          <p><strong>New Time:</strong> ${eventData.demo_time}</p>
          <p style="font-size: 12px; color: #6b7280;">Thank you,<br>${brand} Team</p>
        </div>
      `;
      text = `Demo Class Rescheduled:\nCourse: ${eventData.course_name}\nNew Date: ${eventData.demo_date}\nNew Time: ${eventData.demo_time}`;
      templateName = 'demo_booking_rescheduled';
      break;

    case 'demo_booking_cancelled':
      subject = `Demo Class Cancelled: ${eventData.course_name}`;
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #dc2626;">Demo Class Cancelled</h2>
          <p>Dear ${eventData.student_name || 'Learner'},</p>
          <p>Your scheduled demo session for <strong>${eventData.course_name}</strong> has been cancelled.</p>
          <p>Feel free to book a new demo slot at your convenience.</p>
          <p style="font-size: 12px; color: #6b7280;">Best regards,<br>${brand} Team</p>
        </div>
      `;
      text = `Demo Class Cancelled: ${eventData.course_name}.\nYou can reschedule anytime on our platform.`;
      templateName = 'demo_booking_cancelled';
      break;

    default:
      subject = `Notification from ${brand}`;
      html = `<p>${JSON.stringify(eventData)}</p>`;
      text = JSON.stringify(eventData);
  }

  return { subject, html, text, templateName };
}

/**
 * Emit a business event and queue notifications across configured channels
 */
export async function emitNotificationEvent(eventType, eventData = {}) {
  // 1. Fetch event settings
  const setting = await repo.getSettingByEventType(eventType);
  if (!setting) {
    console.log(`[Notification Warning] No settings configured for event: ${eventType}`);
    return [];
  }

  const channels = [];
  if (setting.email_enabled) channels.push('email');
  if (setting.whatsapp_enabled) channels.push('whatsapp');
  if (setting.inapp_enabled) channels.push('inapp');

  if (channels.length === 0) {
    return []; // All channels disabled
  }

  // 2. Resolve recipient lists
  const recipients = [];

  // Super Admin & Admin
  if (setting.notify_super_admin) {
    const admins = await repo.getStaffRecipients(['super_admin', 'admin']);
    for (const a of admins) {
      recipients.push({ type: 'super_admin', user_id: a.id, email: a.email, phone: a.phone });
    }
  }

  // Counsellors
  if (setting.notify_counsellor) {
    const counsellors = await repo.getStaffRecipients(['counsellor']);
    for (const c of counsellors) {
      recipients.push({ type: 'counsellor', user_id: c.id, email: c.email, phone: c.phone });
    }
  }

  // Course Instructors
  if (setting.notify_instructor && eventData.course_id) {
    const instructors = await repo.getCourseInstructorRecipients(eventData.course_id);
    for (const inst of instructors) {
      recipients.push({
        type: 'instructor',
        user_id: inst.user_id,
        email: inst.email,
        phone: inst.phone,
      });
    }
  }

  // Student / Customer
  if (setting.notify_student && (eventData.email || eventData.phone || eventData.user_id)) {
    recipients.push({
      type: 'student',
      user_id: eventData.user_id || null,
      email: eventData.email || eventData.student_email,
      phone: eventData.phone || eventData.student_phone,
    });
  }

  // 3. Queue notification for each channel and recipient
  const queuedNotifications = [];
  const eventRef = eventData.event_id || eventData.contact_id || eventData.booking_id || eventData.demo_id || Date.now();

  for (const r of recipients) {
    const payload = buildNotificationPayload(eventType, eventData, r.type);

    for (const ch of channels) {
      let recipientAddress = null;
      if (ch === 'email') recipientAddress = r.email;
      else if (ch === 'whatsapp') recipientAddress = r.phone;
      else if (ch === 'inapp') recipientAddress = r.user_id ? String(r.user_id) : r.email;

      if (!recipientAddress) continue; // No contact detail for this channel

      const idempotencyKey = `${eventType}_${eventRef}_${ch}_${recipientAddress}`;

      const queued = await repo.queueNotification({
        idempotency_key: idempotencyKey,
        user_id: r.user_id,
        type: eventType,
        event_type: eventType,
        event_id: String(eventRef),
        template_name: payload.templateName,
        channel: ch,
        recipient: recipientAddress,
        payload: {
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          eventData,
        },
      });

      if (queued) queuedNotifications.push(queued);
    }
  }

  return queuedNotifications;
}

export default {
  emitNotificationEvent,
};
