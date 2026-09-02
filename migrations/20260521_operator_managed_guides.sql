-- Multi-guide operator system: operators manage team guide profiles

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_operator boolean NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS managed_by_operator_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_managed_by_operator ON users(managed_by_operator_id);
CREATE INDEX IF NOT EXISTS idx_users_is_operator ON users(is_operator) WHERE is_operator = true;

COMMENT ON COLUMN users.is_operator IS 'Tour company / DMC account that manages multiple guide profiles';
COMMENT ON COLUMN users.managed_by_operator_id IS 'Set when guide profile was created by an operator';

-- Extended guide marketplace profile (1:1 profiles row per user)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_slug text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS guide_profile_status text NOT NULL DEFAULT 'draft';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS certification_status text NOT NULL DEFAULT 'pending';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS experience_tier_declared smallint;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS experience_tier_verified smallint;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS years_experience integer;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tours_completed_estimate integer;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS destinations text[];

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS crisis_handling_example text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS local_expertise_highlight text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pre_tour_preparation text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS client_fit_description text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS intro_video_url text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS daily_rate_amount numeric(12, 2);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS daily_rate_currency text DEFAULT 'JPY';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_profile_slug ON profiles(profile_slug) WHERE profile_slug IS NOT NULL;

COMMENT ON COLUMN profiles.profile_slug IS 'Permanent public URL slug (/g/{slug})';
COMMENT ON COLUMN profiles.guide_profile_status IS 'draft | published | archived | deactivated';
COMMENT ON COLUMN profiles.certification_status IS 'pending | certified | rejected';
COMMENT ON COLUMN profiles.experience_tier_declared IS 'Self-declared tier 1, 2, or 3 (operator-set)';

-- Invite link for guide self-onboarding (video, photo, etc.)
CREATE TABLE IF NOT EXISTS operator_guide_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guide_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  email text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operator_guide_invites_token ON operator_guide_invites(token);
CREATE INDEX IF NOT EXISTS idx_operator_guide_invites_guide ON operator_guide_invites(guide_user_id);
