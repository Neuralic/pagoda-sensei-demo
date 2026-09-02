-- Guide-to-tour assignment within an operator (DMC) account.
-- Operator = user who owns tours (tour.user_id). Roster = guides they may assign.

-- Platform guide tier (shown on marketplace)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'guide_tier_enum') THEN
    CREATE TYPE guide_tier_enum AS ENUM ('apprentice', 'professional', 'master');
  END IF;
END$$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS guide_tier guide_tier_enum DEFAULT 'professional';

COMMENT ON COLUMN users.guide_tier IS 'Marketplace tier badge: apprentice, professional, master';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS marketplace_available boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.marketplace_available IS 'When false, guide hidden from assignment browse (operator can still manage roster)';

-- Operator roster: guides an operator may assign to their tours
CREATE TABLE IF NOT EXISTS operator_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guide_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operator_roster_operator_guide_unique UNIQUE (operator_id, guide_id),
  CONSTRAINT operator_roster_no_self CHECK (operator_id <> guide_id)
);

CREATE INDEX IF NOT EXISTS idx_operator_roster_operator ON operator_roster(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_roster_guide ON operator_roster(guide_id);

COMMENT ON TABLE operator_roster IS 'Guides on an operator (DMC) roster; only these guides can be assigned to that operator tours';

-- Many-to-many: guide assigned to tour (scoped to operator who owns the tour)
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
