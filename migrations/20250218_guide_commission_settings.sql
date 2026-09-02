-- Per-guide commission settings (admin can set for each guide).
CREATE TABLE IF NOT EXISTS guide_commission_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  commission_marketplace_pct numeric NOT NULL DEFAULT 35,
  commission_agent_pct numeric NOT NULL DEFAULT 15,
  vat_rate_pct numeric NOT NULL DEFAULT 10,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Backfill: set default commission for all existing guides (35/15/10).
INSERT INTO guide_commission_settings (user_id, commission_marketplace_pct, commission_agent_pct, vat_rate_pct)
SELECT id, 35, 15, 10
FROM users
WHERE role = 'guide'
ON CONFLICT (user_id) DO NOTHING;
