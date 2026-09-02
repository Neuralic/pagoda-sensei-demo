-- Multi-register restriction by phone OR full name (different emails are allowed).
--
-- SUPERSEDED for production dual agent/guide accounts:
-- Run **20260723_users_registration_unique_by_role.sql** instead.
-- This file's GLOBAL unique indexes on phone/name alone will fail (or block)
-- when the same person has both an agent and a guide account.
--
-- Kept for history / column backfill only. Prefer the by-role migration for indexes.

-- Align existing emails to lowercase so login lookups stay consistent.
UPDATE users
SET email = lower(trim(email))
WHERE email IS NOT NULL
  AND email <> lower(trim(email));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_normalized text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name_normalized text;

UPDATE users
SET phone_normalized = regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
WHERE phone IS NOT NULL
  AND phone <> ''
  AND (phone_normalized IS NULL OR phone_normalized = '');

UPDATE users
SET phone_normalized = NULL
WHERE phone_normalized IS NOT NULL
  AND length(phone_normalized) < 8;

UPDATE users
SET name_normalized = lower(trim(regexp_replace(
  concat_ws(' ', coalesce(first_name, ''), coalesce(last_name, '')),
  '\s+',
  ' ',
  'g'
)))
WHERE (name_normalized IS NULL OR name_normalized = '')
  AND (
    coalesce(trim(first_name), '') <> ''
    OR coalesce(trim(last_name), '') <> ''
  );

UPDATE users
SET name_normalized = NULL
WHERE name_normalized IS NOT NULL
  AND (
    length(name_normalized) < 3
    OR position(' ' in name_normalized) = 0
  );

-- Drop previous email uniqueness from this feature if it was applied.
DROP INDEX IF EXISTS users_email_unique_lower;

-- DO NOT create global unique indexes here — use 20260723_users_registration_unique_by_role.sql
-- (agent + guide dual accounts share phone/name and must be allowed.)

COMMENT ON COLUMN users.phone_normalized IS 'Digits-only phone for multi-register detection (unique with role — see 20260723).';
COMMENT ON COLUMN users.name_normalized IS 'Lowercased "first last" for multi-register detection (unique with role — see 20260723).';
