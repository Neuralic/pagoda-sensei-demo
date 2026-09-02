-- Fix registration uniqueness so ONE person may have BOTH an agent and a guide account
-- (same phone / full name / email, different roles).
--
-- Still blocks: two agent accounts or two guide accounts with the same phone, name, or email.
--
-- Safe to re-run. If 20260708 partially applied (columns exist, unique index failed), this finishes the job.

-- 1) Ensure helper columns exist + backfill
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_normalized text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name_normalized text;

UPDATE users
SET email = lower(trim(email))
WHERE email IS NOT NULL
  AND email <> lower(trim(email));

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

-- 2) Drop GLOBAL unique indexes/constraints (these break agent+guide dual accounts)
DROP INDEX IF EXISTS users_phone_normalized_unique;
DROP INDEX IF EXISTS users_name_normalized_unique;
-- Drop UNIQUE constraint first (it owns the index). Do NOT DROP INDEX users_email_key.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;
DROP INDEX IF EXISTS users_email_unique_lower;

-- 3) Clear SAME-ROLE duplicate keys so the new indexes can be created.
--    Keeps the earliest account (created_at, then id). Later same-role rows lose the key
--    (they can still log in by email; admin can merge later).
--    Agent+guide pairs with the same phone/name are NOT cleared.

WITH phone_ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY phone_normalized, role
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM users
  WHERE phone_normalized IS NOT NULL
    AND length(phone_normalized) >= 8
    AND role IS NOT NULL
)
UPDATE users u
SET phone_normalized = NULL
FROM phone_ranked r
WHERE u.id = r.id
  AND r.rn > 1;

WITH name_ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY name_normalized, role
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM users
  WHERE name_normalized IS NOT NULL
    AND length(name_normalized) >= 3
    AND position(' ' in name_normalized) > 0
    AND role IS NOT NULL
)
UPDATE users u
SET name_normalized = NULL
FROM name_ranked r
WHERE u.id = r.id
  AND r.rn > 1;

-- Same-role duplicate emails: keep earliest; suffix later emails so the unique index can be created.
WITH email_ranked AS (
  SELECT
    id,
    email,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(email)), role
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM users
  WHERE email IS NOT NULL
    AND trim(email) <> ''
    AND role IS NOT NULL
)
UPDATE users u
SET email = lower(trim(split_part(r.email, '@', 1)))
  || '+dup' || r.rn::text || '@'
  || split_part(r.email, '@', 2)
FROM email_ranked r
WHERE u.id = r.id
  AND r.rn > 1
  AND position('@' in r.email) > 0;

-- 4) Unique per (identity key, role) — allows agent+guide dual accounts
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_normalized_role_unique
  ON users (phone_normalized, role)
  WHERE phone_normalized IS NOT NULL
    AND length(phone_normalized) >= 8
    AND role IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_name_normalized_role_unique
  ON users (name_normalized, role)
  WHERE name_normalized IS NOT NULL
    AND length(name_normalized) >= 3
    AND position(' ' in name_normalized) > 0
    AND role IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_role_unique
  ON users (lower(trim(email)), role)
  WHERE email IS NOT NULL
    AND trim(email) <> ''
    AND role IS NOT NULL;

COMMENT ON COLUMN users.phone_normalized IS
  'Digits-only phone for multi-register detection. Unique together with role (agent+guide dual accounts allowed).';
COMMENT ON COLUMN users.name_normalized IS
  'Lowercased "first last" for multi-register detection. Unique together with role.';

-- 5) Optional audit: list remaining same-role phone collisions (should be empty)
-- SELECT phone_normalized, role, count(*), array_agg(id), array_agg(email)
-- FROM users
-- WHERE phone_normalized IS NOT NULL AND length(phone_normalized) >= 8
-- GROUP BY phone_normalized, role
-- HAVING count(*) > 1;
