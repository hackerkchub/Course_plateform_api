import { z } from 'zod';

export const createSessionSchema = z.object({
  batch_id: z.coerce.number().int().positive('Valid batch ID is required'),
  session_number: z.coerce.number().int().positive('Valid session number is required'),
  session_date: z.string({ required_error: 'Session date is required' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be HH:MM or HH:MM:SS').nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be HH:MM or HH:MM:SS').nullable().optional(),
  title: z.string().max(150).nullable().optional(),
  status: z.enum(['scheduled', 'conducted', 'cancelled']).default('scheduled').optional(),
});

export const updateSessionSchema = z.object({
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  title: z.string().max(150).nullable().optional(),
  status: z.enum(['scheduled', 'conducted', 'cancelled']).optional(),
});

export const markAttendanceSchema = z.object({
  records: z.array(z.object({
    student_id: z.coerce.number().int().positive('Valid student ID is required'),
    status: z.enum(['present', 'absent', 'late', 'excused']),
    notes: z.string().max(255).nullable().optional(),
  })).min(1, 'At least one attendance record is required'),
});

export const updateDemoStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'attended', 'cancelled']),
  notes: z.string().max(1000).nullable().optional(),
});

export const updateInstructorProfileSchema = z.object({
  designation: z.string().max(150).nullable().optional(),
  experience_years: z.coerce.number().min(0).max(99).nullable().optional(),
  bio: z.string().nullable().optional(),
  photo_url: z.string().max(500).nullable().optional(),
  social_links: z.record(z.string()).nullable().optional(),
});

export const createModuleSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(255),
  description: z.string().nullable().optional(),
  display_order: z.coerce.number().int().min(0).default(0).optional(),
});

export const updateModuleSchema = z.object({
  title: z.string().trim().min(2).max(255).optional(),
  description: z.string().nullable().optional(),
  display_order: z.coerce.number().int().min(0).optional(),
  is_published: z.boolean().optional(),
});

export const createLessonSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(255),
  description: z.string().nullable().optional(),
  lesson_type: z.enum(['video', 'article', 'quiz', 'assignment']).default('video').optional(),
  content_url: z.string().max(500).nullable().optional(),
  duration_seconds: z.coerce.number().int().min(0).default(0).optional(),
  duration_minutes: z.coerce.number().int().min(0).optional(),
  is_preview: z.boolean().default(false).optional(),
  display_order: z.coerce.number().int().min(0).default(0).optional(),
});

export const updateLessonSchema = z.object({
  title: z.string().trim().min(2).max(255).optional(),
  description: z.string().nullable().optional(),
  lesson_type: z.enum(['video', 'article', 'quiz', 'assignment']).optional(),
  content_url: z.string().max(500).nullable().optional(),
  duration_seconds: z.coerce.number().int().min(0).optional(),
  duration_minutes: z.coerce.number().int().min(0).optional(),
  is_preview: z.boolean().optional(),
  is_published: z.boolean().optional(),
  display_order: z.coerce.number().int().min(0).optional(),
});

export const createMaterialSchema = z.object({
  course_id: z.coerce.number().int().positive('Valid course ID is required'),
  title: z.string().trim().min(2, 'Title is required').max(255),
  material_type: z.enum(['brochure', 'syllabus', 'notes', 'worksheet', 'project', 'recording', 'other']).default('notes').optional(),
  file_path: z.string().min(1, 'File path or URL is required').max(500),
  file_type: z.string().max(50).nullable().optional(),
  file_size_bytes: z.coerce.number().int().min(0).default(0).optional(),
});

export default {
  createSessionSchema,
  updateSessionSchema,
  markAttendanceSchema,
  updateDemoStatusSchema,
  updateInstructorProfileSchema,
  createModuleSchema,
  updateModuleSchema,
  createLessonSchema,
  updateLessonSchema,
  createMaterialSchema,
};
