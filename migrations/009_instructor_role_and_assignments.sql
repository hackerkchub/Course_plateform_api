-- =====================================================================================
-- Migration: 009_instructor_role_and_assignments.sql
-- Module A: Instructor Management & Instructor Portal Foundation
-- Database Engine: MariaDB 10.4.32 / MySQL 8.0 Compatible
-- Charset: utf8mb4, Collation: utf8mb4_unicode_ci
-- Revision: Phase 2A.4 Deterministic Backfill Correction
-- =====================================================================================
-- Description:
-- 1. Extends users.role ENUM to incorporate 'instructor' role while preserving all existing roles.
-- 2. Links marketing CMS instructors table to authentication users table via user_id & email.
-- 3. Introduces course_instructors junction table for flexible multi-instructor assignments
--    with MariaDB virtual column constraint guaranteeing at most one primary instructor per course.
-- 4. Deterministically backfills existing courses.instructor_id relationships into course_instructors.
-- 5. Enables batch-level instructor assignments in course_batches (NULL falls back to course primary).
-- 6. Introduces batch_sessions table to model discrete class sessions, supporting multiple
--    sessions on the same calendar date with session numbers, time slots, and guest instructors.
-- 7. Introduces batch_attendance table linked to session_id, enforcing unique student attendance
--    per session and protecting historical records with ON DELETE RESTRICT.
--
-- Safety & Data Integrity Guarantees:
-- - Non-destructive: Does NOT drop or overwrite any existing records or columns.
-- - Historical Protection: ON DELETE RESTRICT prevents accidental cascading deletion of attendance
--   and course-instructor historical relationships.
-- - Null-safe: Existing instructors and batches remain 100% functional with NULL user/instructor IDs.
-- - Deterministic backfill: Multi-step conflict-safe logic ensures repeat executions never cause
--   unique key violations or overwrite existing primary assignments.
-- =====================================================================================

-- Step 1: Extend users.role ENUM to include 'instructor'
-- Preserves existing roles ('user', 'counsellor', 'admin', 'super_admin') and default 'user'.
ALTER TABLE users 
  MODIFY COLUMN role ENUM('user', 'counsellor', 'instructor', 'admin', 'super_admin') NOT NULL DEFAULT 'user';

-- Step 2: Link instructors profile table to users authentication table
-- user_id and email are nullable & unique so existing marketing profiles remain valid without user accounts.
ALTER TABLE instructors 
  ADD COLUMN user_id BIGINT UNSIGNED NULL UNIQUE AFTER id,
  ADD COLUMN email VARCHAR(191) NULL UNIQUE AFTER name,
  ADD CONSTRAINT fk_instructors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Step 3: Create course_instructors junction table for multi-instructor course assignments
-- Uses a virtual generated column (primary_course_id) to enforce at most one primary instructor per course.
-- In MariaDB / MySQL, UNIQUE permits multiple NULLs, but rejects duplicate non-NULL course IDs.
-- ON DELETE RESTRICT on instructor_id prevents hard-deleting instructors with historical course ownership.
CREATE TABLE IF NOT EXISTS course_instructors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT UNSIGNED NOT NULL,
  instructor_id BIGINT UNSIGNED NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  can_manage_curriculum TINYINT(1) NOT NULL DEFAULT 1,
  primary_course_id BIGINT UNSIGNED AS (IF(is_primary = 1, course_id, NULL)) VIRTUAL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_course_instructor (course_id, instructor_id),
  UNIQUE KEY uq_course_primary_instructor (primary_course_id),
  INDEX idx_ci_course (course_id),
  INDEX idx_ci_instructor (instructor_id),
  INDEX idx_ci_primary (is_primary),
  CONSTRAINT fk_ci_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_instructor FOREIGN KEY (instructor_id) REFERENCES instructors(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 4: Deterministic and conflict-safe backfill of existing courses.instructor_id mappings
-- Preserves legacy courses.instructor_id while establishing junction records in course_instructors.
-- Guarantees:
-- 1. Never creates duplicate primary instructors (respects uq_course_primary_instructor).
-- 2. Never overwrites or demotes an existing primary instructor.
-- 3. If a course already has a primary instructor, legacy mapping is safely added/kept as secondary (is_primary = 0).
-- 4. If no primary instructor exists, legacy mapping is established/promoted to primary (is_primary = 1).
-- 5. Fully idempotent and safe for repeated execution without duplicate key conflicts.

-- Step 4a: If the legacy mapping already exists as a secondary instructor and NO primary exists for the course,
-- promote it to primary (is_primary = 1).
UPDATE course_instructors ci
JOIN courses c 
  ON c.id = ci.course_id AND c.instructor_id = ci.instructor_id
LEFT JOIN course_instructors primary_ci 
  ON primary_ci.course_id = ci.course_id AND primary_ci.is_primary = 1
SET ci.is_primary = 1
WHERE ci.is_primary = 0
  AND primary_ci.id IS NULL;

-- Step 4b: Insert missing legacy mappings into course_instructors.
-- If the course already has a primary instructor, insert as secondary (is_primary = 0);
-- otherwise, insert as primary (is_primary = 1).
INSERT INTO course_instructors (course_id, instructor_id, is_primary, can_manage_curriculum)
SELECT 
  c.id, 
  c.instructor_id, 
  IF(primary_ci.id IS NULL, 1, 0),
  1
FROM courses c
LEFT JOIN course_instructors primary_ci 
  ON primary_ci.course_id = c.id AND primary_ci.is_primary = 1
LEFT JOIN course_instructors existing_ci 
  ON existing_ci.course_id = c.id AND existing_ci.instructor_id = c.instructor_id
WHERE c.instructor_id IS NOT NULL
  AND existing_ci.id IS NULL;

-- Step 5: Enable batch-level instructor assignments in course_batches
-- Nullable foreign key: NULL signifies inheritance from course primary instructor.
ALTER TABLE course_batches 
  ADD COLUMN instructor_id BIGINT UNSIGNED NULL AFTER course_id,
  ADD CONSTRAINT fk_course_batches_instructor FOREIGN KEY (instructor_id) REFERENCES instructors(id) ON DELETE SET NULL;

-- Step 6: Create batch_sessions table for discrete class session scheduling
-- Models individual class sessions, naturally permitting multiple sessions on the same date (e.g. morning + evening).
-- Supports individual session topics, timings, and dedicated session instructors.
CREATE TABLE IF NOT EXISTS batch_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  session_number INT UNSIGNED NOT NULL,
  session_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  title VARCHAR(150) NULL,
  instructor_id BIGINT UNSIGNED NULL,
  status ENUM('scheduled', 'conducted', 'cancelled') NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_batch_session_number (batch_id, session_number),
  INDEX idx_bs_batch_date (batch_id, session_date),
  INDEX idx_bs_instructor (instructor_id),
  CONSTRAINT fk_bs_batch FOREIGN KEY (batch_id) REFERENCES course_batches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bs_instructor FOREIGN KEY (instructor_id) REFERENCES instructors(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 7: Create batch_attendance table linked to discrete batch sessions
-- Enforces exactly one attendance record per student per session (UNIQUE session_id, student_id).
-- ON DELETE RESTRICT ensures that historical student attendance cannot be deleted if a student or session is purged.
CREATE TABLE IF NOT EXISTS batch_attendance (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  status ENUM('present', 'absent', 'late', 'excused') NOT NULL DEFAULT 'present',
  notes VARCHAR(255) NULL,
  marked_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_session_student (session_id, student_id),
  INDEX idx_ba_session (session_id),
  INDEX idx_ba_student (student_id),
  INDEX idx_ba_marked_by (marked_by),
  CONSTRAINT fk_ba_session FOREIGN KEY (session_id) REFERENCES batch_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ba_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ba_marked_by FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================================
-- DOCUMENTED ROLLBACK PROCEDURE (MANUAL / BACKUP REQUIRED):
-- WARNING: MariaDB executes implicit commits on DDL statements. Transactions cannot undo DDL.
-- If rollback is required in a controlled maintenance window:
-- 1. DROP TABLE IF EXISTS batch_attendance;
-- 2. DROP TABLE IF EXISTS batch_sessions;
-- 3. ALTER TABLE course_batches DROP FOREIGN KEY fk_course_batches_instructor, DROP COLUMN instructor_id;
-- 4. DROP TABLE IF EXISTS course_instructors;
-- 5. ALTER TABLE instructors DROP FOREIGN KEY fk_instructors_user, DROP COLUMN email, DROP COLUMN user_id;
-- 6. ALTER TABLE users MODIFY COLUMN role ENUM('user', 'counsellor', 'admin', 'super_admin') NOT NULL DEFAULT 'user';
--    (Ensure no users have role='instructor' before reverting enum).
-- =====================================================================================
