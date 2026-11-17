import { z } from 'zod';

export const provisionCounsellorSchema = z.object({
  name: z
    .string({ required_error: 'Full name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters'),
  email: z
    .string({ required_error: 'Email address is required' })
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address')
    .max(191, 'Email must not exceed 191 characters'),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9][0-9]{9}$/, 'Phone must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9')
    .optional()
    .nullable(),
});

export const updateCounsellorStatusSchema = z.object({
  status: z.enum(['active', 'blocked'], {
    errorMap: () => ({ message: 'Status must be either active or blocked' }),
  }),
});

export const promoteStudentSchema = z.object({
  email: z
    .string({ required_error: 'Student email is required' })
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address')
    .max(191, 'Email must not exceed 191 characters'),
});

export const listCounsellorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  status: z.enum(['all', 'active', 'blocked']).default('all'),
});

export default {
  provisionCounsellorSchema,
  updateCounsellorStatusSchema,
  promoteStudentSchema,
  listCounsellorsQuerySchema,
};
