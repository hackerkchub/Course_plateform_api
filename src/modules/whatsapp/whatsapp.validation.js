import { z } from 'zod';

export const createWhatsAppContactSchema = z.object({
  display_name: z.string({ required_error: 'Display name is required' }).trim().min(2, 'Display name must be at least 2 characters').max(150),
  department: z.string().trim().min(2).max(100).default('admissions'),
  country_code: z.string().trim().regex(/^\+\d{1,4}$/, 'Country code must start with + followed by 1 to 4 digits (e.g. +91)').default('+91'),
  phone_number: z.string({ required_error: 'Phone number is required' }).trim().min(7, 'Phone number must be at least 7 digits').max(20),
  is_active: z.coerce.boolean().default(true),
  is_default: z.coerce.boolean().default(false),
  custom_message_template: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const updateWhatsAppContactSchema = z.object({
  display_name: z.string().trim().min(2, 'Display name must be at least 2 characters').max(150).optional(),
  department: z.string().trim().min(2).max(100).optional(),
  country_code: z.string().trim().regex(/^\+\d{1,4}$/, 'Country code must start with + followed by 1 to 4 digits (e.g. +91)').optional(),
  phone_number: z.string().trim().min(7, 'Phone number must be at least 7 digits').max(20).optional(),
  is_active: z.coerce.boolean().optional(),
  is_default: z.coerce.boolean().optional(),
  custom_message_template: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const updateStatusSchema = z.object({
  is_active: z.coerce.boolean({ required_error: 'is_active is required' }),
});

export const listWhatsAppContactsQuerySchema = z.object({
  search: z.string().trim().optional(),
  department: z.string().trim().optional(),
  is_active: z.enum(['true', 'false', '1', '0']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const previewQuerySchema = z.object({
  course_id: z.coerce.number().int().positive().optional(),
  custom_message: z.string().trim().max(1000).optional(),
});
