-- Re-link published tours that are missing guide_tour_assignments rows.
-- (Safe to re-run.) Fixes cases where assignments failed to persist or were lost.

INSERT INTO guide_tour_assignments (operator_id, tour_id, guide_id)
SELECT t.user_id, t.id, t.user_id
FROM tour t
INNER JOIN profiles p ON p.user_id = t.user_id
WHERE t.status = 'published'
  AND t.user_id IS NOT NULL
  AND p.profile_slug IS NOT NULL
  AND trim(p.profile_slug) <> ''
  AND (
    p.guide_profile_status IS NULL
    OR lower(p.guide_profile_status::text) = 'published'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM guide_tour_assignments gta
    WHERE gta.tour_id = t.id
  )
ON CONFLICT (tour_id, guide_id) DO NOTHING;
