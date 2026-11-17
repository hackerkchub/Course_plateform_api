import { z } from 'zod';

export const submitContactSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(150, 'Name cannot exceed 150 characters'),
  email: z.string().trim().email('Invalid email address').max(191),
  phone: z.string().trim().min(7, 'Phone number must be at least 7 digits').max(20, 'Phone cannot exceed 20 characters')
    .regex(/^[0-9+\s\-()]+$/, 'Invalid phone number format'),
  subject: z.string().trim().min(2, 'Subject must be at least 2 characters').max(150, 'Subject cannot exceed 150 characters'),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(5000, 'Message cannot exceed 5000 characters'),
});

export const updateContactStatusSchema = z.object({
  status: z.enum(['new', 'in_progress', 'responded', 'closed']),
  admin_notes: z.string().max(2000).nullable().optional(),
});

export const assignContactSchema = z.object({
  assigned_to: z.coerce.number().int().positive('Valid user ID is required').nullable(),
});

export default {
  submitContactSchema,
  updateContactStatusSchema,
  assignContactSchema,
};
