import { z } from 'zod';

export const createInstructorSchema = z.object({
  name: z.string({
    required_error: 'Instructor name is required',
  }).trim().min(2, 'Name must be at least 2 characters').max(150, 'Name must not exceed 150 characters'),
  designation: z.string().max(150, 'Designation must not exceed 150 characters').nullable().optional(),
  experience_years: z.coerce.number().min(0, 'Experience years must be 0 or greater').max(99, 'Invalid experience years').nullable().optional(),
  bio: z.string().nullable().optional(),
  photo_url: z.string().max(500, 'Photo URL must not exceed 500 characters').nullable().optional(),
  social_links: z.record(z.string()).nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active').optional(),
});

export const updateInstructorSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(150, 'Name must not exceed 150 characters').optional(),
  designation: z.string().max(150, 'Designation must not exceed 150 characters').nullable().optional(),
  experience_years: z.coerce.number().min(0).max(99).nullable().optional(),
  bio: z.string().nullable().optional(),
  photo_url: z.string().max(500, 'Photo URL must not exceed 500 characters').nullable().optional(),
  social_links: z.record(z.string()).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const provisionInstructorSchema = z.object({
  instructor_id: z.coerce.number().int().positive().optional(),
  email: z.string().trim().email('Invalid email address').max(191).optional(),
  name: z.string().trim().min(2).max(150).optional(),
  phone: z.string().max(20).optional(),
  password: z.string().min(6).optional(),
  designation: z.string().max(150).nullable().optional(),
  experience_years: z.coerce.number().min(0).max(99).nullable().optional(),
  bio: z.string().nullable().optional(),
  photo_url: z.string().max(500).nullable().optional(),
  social_links: z.record(z.string()).nullable().optional(),
});

export const updateInstructorStatusSchema = z.object({
  status: z.enum(['active', 'inactive'], {
    required_error: 'Status must be active or inactive',
  }),
});

export const assignCourseInstructorSchema = z.object({
  instructor_id: z.coerce.number().int().positive('Valid instructor ID is required'),
  is_primary: z.union([z.boolean(), z.coerce.number().int().min(0).max(1)]).default(false).transform(v => typeof v === 'boolean' ? (v ? 1 : 0) : v).optional(),
  can_manage_curriculum: z.union([z.boolean(), z.coerce.number().int().min(0).max(1)]).default(true).transform(v => typeof v === 'boolean' ? (v ? 1 : 0) : v).optional(),
});

export const updateCourseInstructorSchema = z.object({
  is_primary: z.coerce.number().int().min(0).max(1).optional(),
  can_manage_curriculum: z.coerce.number().int().min(0).max(1).optional(),
});

export const assignBatchInstructorSchema = z.object({
  instructor_id: z.coerce.number().int().positive().nullable(),
});

export default {
  createInstructorSchema,
  updateInstructorSchema,
  provisionInstructorSchema,
  updateInstructorStatusSchema,
  assignCourseInstructorSchema,
  updateCourseInstructorSchema,
  assignBatchInstructorSchema,
};
