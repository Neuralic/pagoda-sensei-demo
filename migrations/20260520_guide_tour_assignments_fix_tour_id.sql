-- Run this if the main migration failed on guide_tour_assignments (tour.id is bigint, not uuid).
-- Safe when operator_roster / enum / columns were already created.

CREATE TABLE IF NOT EXISTS guide_tour_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tour_id bigint NOT NULL REFERENCES tour(id) ON DELETE CASCADE,
  guide_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guide_tour_assignments_tour_guide_unique UNIQUE (tour_id, guide_id)
);

CREATE INDEX IF NOT EXISTS idx_guide_tour_assignments_operator ON guide_tour_assignments(operator_id);
CREATE INDEX IF NOT EXISTS idx_guide_tour_assignments_tour ON guide_tour_assignments(tour_id);
CREATE INDEX IF NOT EXISTS idx_guide_tour_assignments_guide ON guide_tour_assignments(guide_id);

COMMENT ON TABLE guide_tour_assignments IS 'Maps roster guides to operator-owned tours for agent discovery';
