-- =====================================================================================
-- Migration: 011_whatsapp_management.sql
-- Module: Centralized WhatsApp Desk & Course-Wise WhatsApp Number Management
-- Database Engine: MariaDB 10.4.32 / MySQL 8.0 Compatible
-- Charset: utf8mb4, Collation: utf8mb4_unicode_ci
-- =====================================================================================
-- Description:
-- 1. Creates whatsapp_contacts table to manage multiple WhatsApp phone numbers with
--    department assignments, active status, atomic default routing, and custom message templates.
-- 2. Extends courses table with whatsapp_contact_id (FK to whatsapp_contacts with ON DELETE SET NULL)
--    and whatsapp_enabled boolean flag (defaults to 1/true).
-- =====================================================================================

-- Step 1: Create whatsapp_contacts table
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  display_name VARCHAR(150) NOT NULL,
  department VARCHAR(100) NOT NULL DEFAULT 'admissions',
  country_code VARCHAR(5) NOT NULL DEFAULT '+91',
  phone_number VARCHAR(20) NOT NULL,
  normalized_phone VARCHAR(20) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  custom_message_template TEXT NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_wa_active (is_active),
  INDEX idx_wa_default (is_default),
  INDEX idx_wa_normalized (normalized_phone),
  INDEX idx_wa_deleted (deleted_at),
  INDEX idx_wa_department (department),
  CONSTRAINT fk_wa_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_wa_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: Extend courses table with whatsapp_contact_id and whatsapp_enabled
ALTER TABLE courses
  ADD COLUMN whatsapp_contact_id BIGINT UNSIGNED NULL AFTER demo_request_count,
  ADD COLUMN whatsapp_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER whatsapp_contact_id,
  ADD CONSTRAINT fk_courses_whatsapp_contact FOREIGN KEY (whatsapp_contact_id) REFERENCES whatsapp_contacts (id) ON DELETE SET NULL,
  ADD INDEX idx_courses_whatsapp_contact (whatsapp_contact_id);
