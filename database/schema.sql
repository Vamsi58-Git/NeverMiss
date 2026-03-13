-- ============================================================
-- NeverMiss – MySQL Database Schema
-- Run this file in phpMyAdmin or via MySQL CLI:
--   source /path/to/schema.sql
-- ============================================================

-- Create and select the database
CREATE DATABASE IF NOT EXISTS nevermiss
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE nevermiss;

-- ============================================================
-- Table: opportunities
-- Stores all captured internship / hackathon / scholarship items
-- ============================================================
CREATE TABLE IF NOT EXISTS opportunities (
  id          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company     VARCHAR(150)  NOT NULL DEFAULT '',
  role        VARCHAR(200)  NOT NULL DEFAULT '',
  deadline    DATE                   DEFAULT NULL,
  link        TEXT,
  source      VARCHAR(50)            DEFAULT 'Other',
  status      VARCHAR(30)   NOT NULL DEFAULT 'Not Applied',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_deadline (deadline),
  INDEX idx_status   (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
