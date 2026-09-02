-- All self-registered guides are tour operators; team guides stay managed_by_operator_id.

UPDATE users
SET is_operator = true
WHERE role = 'guide'
  AND managed_by_operator_id IS NULL
  AND (is_operator IS DISTINCT FROM true);

-- Backfill marketplace profile rows for operators missing a profiles row.
INSERT INTO profiles (
  user_id,
  profile_slug,
  guide_profile_status,
  certification_status,
  marketplace_available,
  languages
)
SELECT
  u.id,
  'g-' || substr(replace(u.id::text, '-', ''), 1, 12),
  'draft',
  'pending',
  true,
  ARRAY['English']::text[]
FROM users u
LEFT JOIN profiles p ON p.user_id = u.id
WHERE u.role = 'guide'
  AND u.is_operator = true
  AND p.user_id IS NULL
ON CONFLICT DO NOTHING;

-- Ensure existing operator profiles have a slug when missing.
UPDATE profiles p
SET profile_slug = 'g-' || substr(replace(p.user_id::text, '-', ''), 1, 12)
FROM users u
WHERE p.user_id = u.id
  AND u.role = 'guide'
  AND u.is_operator = true
  AND p.profile_slug IS NULL;
