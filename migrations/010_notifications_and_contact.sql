-- =====================================================================================
-- Migration: 010_notifications_and_contact.sql
-- Module B: Centralized Email & WhatsApp Notification System & Contact Storage Foundation
-- Database Engine: MariaDB 10.4.32 / MySQL 8.0 Compatible
-- Charset: utf8mb4, Collation: utf8mb4_unicode_ci
-- Revision: Phase 2A.1 Safety Corrections
-- =====================================================================================
-- Description:
-- 1. Creates contact_messages table for web inquiry intake with assignment and audit trails.
-- 2. Creates notification_settings table for event-level channel toggles (Email/WhatsApp disabled by default).
-- 3. Seeds initial notification settings for all 7 required core event types idempotently.
-- 4. Enhances existing notifications table with idempotency, event metadata, retry tracking, and error logging.
-- 5. Creates whatsapp_consents table with strict regulatory safety:
--    - Default status is 'pending' (zero implied consent).
--    - consent_at is NULL until an explicit affirmative opt-in event occurs.
--    - Preserves audit trails: consent_evidence, consent_ip, opt_out_source, opt_out_reason.
--
-- Safety & Data Integrity Guarantees:
-- - Non-destructive: Extends existing notifications table while preserving existing queued records.
-- - Zero Implied Consent: WhatsApp messages cannot be dispatched without explicit opt-in.
-- - Safe defaults: WhatsApp and Email are disabled by default until verified in later phases.
-- - Idempotent seed: INSERT IGNORE ensures repeat runs do not overwrite customized settings.
-- =====================================================================================

-- Step 1: Create contact_messages table for public inquiry intake
CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  subject VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('new', 'in_progress', 'responded', 'closed') NOT NULL DEFAULT 'new',
  assigned_to BIGINT UNSIGNED NULL,
  admin_notes TEXT NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_contact_status (status),
  INDEX idx_contact_email (email),
  INDEX idx_contact_assigned (assigned_to),
  INDEX idx_contact_created (created_at),
  CONSTRAINT fk_contact_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: Create notification_settings table for event-level channel and recipient toggles
CREATE TABLE IF NOT EXISTS notification_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL UNIQUE,
  email_enabled TINYINT(1) NOT NULL DEFAULT 0,
  whatsapp_enabled TINYINT(1) NOT NULL DEFAULT 0,
  inapp_enabled TINYINT(1) NOT NULL DEFAULT 1,
  notify_super_admin TINYINT(1) NOT NULL DEFAULT 1,
  notify_counsellor TINYINT(1) NOT NULL DEFAULT 1,
  notify_instructor TINYINT(1) NOT NULL DEFAULT 1,
  notify_student TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ns_event_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 3: Seed initial default settings for all 7 business events (Idempotent: Email & WhatsApp OFF by default)
INSERT IGNORE INTO notification_settings 
  (event_type, email_enabled, whatsapp_enabled, inapp_enabled, notify_super_admin, notify_counsellor, notify_instructor, notify_student)
VALUES
  ('contact_query_received',   0, 0, 1, 1, 1, 0, 1),
  ('course_inquiry_received',  0, 0, 1, 1, 1, 1, 1),
  ('course_booking_created',   0, 0, 1, 1, 1, 1, 1),
  ('course_booking_cancelled', 0, 0, 1, 1, 1, 1, 1),
  ('demo_booking_created',     0, 0, 1, 1, 1, 1, 1),
  ('demo_booking_rescheduled', 0, 0, 1, 1, 1, 1, 1),
  ('demo_booking_cancelled',   0, 0, 1, 1, 1, 1, 1);

-- Step 4: Enhance existing notifications table for delivery tracking, idempotency, and retry handling
-- Extends status ENUM to include 'processing' state.
ALTER TABLE notifications 
  ADD COLUMN idempotency_key VARCHAR(191) NULL UNIQUE AFTER id,
  ADD COLUMN event_type VARCHAR(50) NULL AFTER type,
  ADD COLUMN event_id VARCHAR(50) NULL AFTER event_type,
  ADD COLUMN template_name VARCHAR(100) NULL AFTER event_id,
  MODIFY COLUMN status ENUM('queued', 'processing', 'sent', 'failed') NOT NULL DEFAULT 'queued',
  ADD COLUMN retry_count INT NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN max_retries INT NOT NULL DEFAULT 3 AFTER retry_count,
  ADD COLUMN next_retry_at DATETIME NULL AFTER sent_at,
  ADD COLUMN error_message TEXT NULL AFTER next_retry_at,
  ADD INDEX idx_notifications_retry (status, next_retry_at),
  ADD INDEX idx_notifications_event (event_type, event_id);

-- Step 5: Create whatsapp_consents table with regulatory compliance and zero implied consent
-- Default status is 'pending' (zero implied consent).
-- consent_at remains NULL until affirmative opt-in event occurs.
CREATE TABLE IF NOT EXISTS whatsapp_consents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  phone VARCHAR(20) NOT NULL,
  status ENUM('pending', 'opted_in', 'opted_out') NOT NULL DEFAULT 'pending',
  consent_source VARCHAR(50) NULL DEFAULT NULL,
  consent_evidence VARCHAR(255) NULL DEFAULT NULL,
  consent_ip VARCHAR(45) NULL DEFAULT NULL,
  consent_at DATETIME NULL DEFAULT NULL,
  opt_out_at DATETIME NULL DEFAULT NULL,
  opt_out_source VARCHAR(50) NULL DEFAULT NULL,
  opt_out_reason VARCHAR(255) NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_consent_phone (phone),
  INDEX idx_wa_consent_user (user_id),
  INDEX idx_wa_consent_status (status),
  CONSTRAINT fk_wa_consent_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================================
-- DOCUMENTED ROLLBACK PROCEDURE (MANUAL / BACKUP REQUIRED):
-- WARNING: MariaDB executes implicit commits on DDL statements. Transactions cannot undo DDL.
-- If rollback is required in a controlled maintenance window:
-- 1. DROP TABLE IF EXISTS whatsapp_consents;
-- 2. ALTER TABLE notifications 
--      DROP INDEX idx_notifications_event,
--      DROP INDEX idx_notifications_retry,
--      DROP COLUMN error_message,
--      DROP COLUMN next_retry_at,
--      DROP COLUMN max_retries,
--      DROP COLUMN retry_count,
--      MODIFY COLUMN status ENUM('queued', 'sent', 'failed') NOT NULL DEFAULT 'queued',
--      DROP COLUMN template_name,
--      DROP COLUMN event_id,
--      DROP COLUMN event_type,
--      DROP COLUMN idempotency_key;
-- 3. DROP TABLE IF EXISTS notification_settings;
-- 4. DROP TABLE IF EXISTS contact_messages;
-- =====================================================================================
