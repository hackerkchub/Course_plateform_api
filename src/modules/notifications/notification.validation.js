import { z } from 'zod';

export const updateNotificationSettingSchema = z.object({
  email_enabled: z.boolean().optional(),
  whatsapp_enabled: z.boolean().optional(),
  inapp_enabled: z.boolean().optional(),
  notify_super_admin: z.boolean().optional(),
  notify_counsellor: z.boolean().optional(),
  notify_instructor: z.boolean().optional(),
  notify_student: z.boolean().optional(),
});

export const recordConsentSchema = z.object({
  phone: z.string().min(7).max(20).regex(/^[0-9+\s\-()]+$/, 'Invalid phone number format'),
  status: z.enum(['opted_in', 'opted_out']),
  source: z.string().max(50).default('web_form').optional(),
  evidence: z.string().max(255).optional(),
  reason: z.string().max(255).optional(),
});

export default {
  updateNotificationSettingSchema,
  recordConsentSchema,
};
