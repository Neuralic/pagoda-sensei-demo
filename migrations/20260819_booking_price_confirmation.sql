-- Advisor Confirm booking → guide must confirm (or amend) the live tour price
-- before the booking is official and Pagoda asks for an invoice.

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS price_confirmation_status text,
  ADD COLUMN IF NOT EXISTS price_confirmation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS price_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS quoted_guide_price_at_request numeric;

COMMENT ON COLUMN job_applications.price_confirmation_status IS
  'requested = advisor asked the guide to confirm this tour''s price; confirmed = guide confirmed and booking is official';
COMMENT ON COLUMN job_applications.quoted_guide_price_at_request IS
  'Guide/net price from the tour library or bid when the advisor requested confirmation';

-- Existing official hires stay booked; new Confirm booking uses the columns above.
UPDATE job_applications
SET
  price_confirmation_status = 'confirmed',
  price_confirmed_at = COALESCE(price_confirmed_at, now())
WHERE
  offer_status IN ('completed', 'hired')
  AND price_confirmation_status IS NULL;
