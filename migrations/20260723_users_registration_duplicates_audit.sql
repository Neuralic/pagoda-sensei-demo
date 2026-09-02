-- DIAGNOSTIC ONLY — works even before phone_normalized / name_normalized columns exist.
-- Does not change data. Run in Supabase SQL Editor.

-- A) Same phone + same role (true duplicates)
WITH normalized AS (
  SELECT
    id,
    email,
    role,
    created_at,
    nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '') AS phone_key
  FROM users
)
SELECT
  phone_key AS phone_normalized,
  role,
  count(*) AS accounts,
  array_agg(id ORDER BY created_at ASC NULLS LAST) AS user_ids,
  array_agg(email ORDER BY created_at ASC NULLS LAST) AS emails,
  array_agg(created_at ORDER BY created_at ASC NULLS LAST) AS created_ats
FROM normalized
WHERE phone_key IS NOT NULL
  AND length(phone_key) >= 8
GROUP BY phone_key, role
HAVING count(*) > 1
ORDER BY count(*) DESC;

-- B) Same full name + same role (true duplicates)
WITH normalized AS (
  SELECT
    id,
    email,
    role,
    created_at,
    lower(trim(regexp_replace(
      concat_ws(' ', coalesce(first_name, ''), coalesce(last_name, '')),
      '\s+',
      ' ',
      'g'
    ))) AS name_key
  FROM users
)
SELECT
  name_key AS name_normalized,
  role,
  count(*) AS accounts,
  array_agg(id ORDER BY created_at ASC NULLS LAST) AS user_ids,
  array_agg(email ORDER BY created_at ASC NULLS LAST) AS emails
FROM normalized
WHERE name_key IS NOT NULL
  AND length(name_key) >= 3
  AND position(' ' in name_key) > 0
GROUP BY name_key, role
HAVING count(*) > 1
ORDER BY count(*) DESC;

-- C) Same phone across DIFFERENT roles (allowed: agent + guide)
WITH normalized AS (
  SELECT
    id,
    email,
    role,
    nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '') AS phone_key
  FROM users
)
SELECT
  phone_key AS phone_normalized,
  count(*) AS accounts,
  count(DISTINCT role) AS roles,
  array_agg(role ORDER BY role) AS role_list,
  array_agg(email ORDER BY role) AS emails,
  array_agg(id ORDER BY role) AS user_ids
FROM normalized
WHERE phone_key IS NOT NULL
  AND length(phone_key) >= 8
GROUP BY phone_key
HAVING count(DISTINCT role) > 1
ORDER BY count(*) DESC;

-- D) Same name across DIFFERENT roles (allowed)
WITH normalized AS (
  SELECT
    id,
    email,
    role,
    lower(trim(regexp_replace(
      concat_ws(' ', coalesce(first_name, ''), coalesce(last_name, '')),
      '\s+',
      ' ',
      'g'
    ))) AS name_key
  FROM users
)
SELECT
  name_key AS name_normalized,
  count(*) AS accounts,
  count(DISTINCT role) AS roles,
  array_agg(role ORDER BY role) AS role_list,
  array_agg(email ORDER BY role) AS emails
FROM normalized
WHERE name_key IS NOT NULL
  AND length(name_key) >= 3
GROUP BY name_key
HAVING count(DISTINCT role) > 1
ORDER BY count(*) DESC;
