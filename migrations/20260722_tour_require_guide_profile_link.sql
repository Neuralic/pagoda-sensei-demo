-- Require every published tour to have at least one guide profile assignment.
-- Operators may self-assign (guide_id = operator_id); roster self-ban stays in place.

-- Backfill: for published tours with no assignments, link the tour owner to their own tour
-- when they have a published (or slug-bearing) guide profile.
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

COMMENT ON TABLE guide_tour_assignments IS
  'Maps guides (including the operator themself) to operator-owned tours. Every published tour should have ≥1 row so proposals can include a public /g/{slug} profile link.';
