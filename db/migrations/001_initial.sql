-- Migration 001 — initial baseline.
-- The full DDL lives in db/schema.sql (loaded by scripts/setup.sh). This file is
-- the migration entry point; for the baseline it simply sources the schema.
--   mysql import_desk < db/schema.sql
-- Subsequent migrations (002_…, 003_…) add ALTER statements on top.
SOURCE schema.sql;
