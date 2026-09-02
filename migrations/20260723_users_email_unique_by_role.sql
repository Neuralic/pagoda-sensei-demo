-- Allow the same email on BOTH an agent and a guide account.
-- Still blocks two accounts with the same email + same role.
--
-- Run this if 20260723_users_registration_unique_by_role.sql was already applied
-- before email-by-role uniqueness was added. Safe to re-run.

-- Drop UNIQUE constraint first (it owns the index). Do NOT DROP INDEX users_email_key.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;
DROP INDEX IF EXISTS users_email_unique_lower;

UPDATE users
SET email = lower(trim(email))
WHERE email IS NOT NULL
  AND email <> lower(trim(email));

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

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_role_unique
  ON users (lower(trim(email)), role)
  WHERE email IS NOT NULL
    AND trim(email) <> ''
    AND role IS NOT NULL;
