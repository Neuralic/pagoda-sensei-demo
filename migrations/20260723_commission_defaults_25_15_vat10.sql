-- New commission defaults: Marketplace 25%, Agent 15%.
-- VAT is removed from sales pricing (stored as 0; app always uses 0%).

ALTER TABLE guide_commission_settings
  ALTER COLUMN commission_marketplace_pct SET DEFAULT 25;

ALTER TABLE guide_commission_settings
  ALTER COLUMN commission_agent_pct SET DEFAULT 15;

ALTER TABLE guide_commission_settings
  ALTER COLUMN vat_rate_pct SET DEFAULT 0;

-- Bring existing rows in line with the new standard (no VAT on sales price).
UPDATE guide_commission_settings
SET
  commission_marketplace_pct = 25,
  commission_agent_pct = 15,
  vat_rate_pct = 0,
  updated_at = now();
