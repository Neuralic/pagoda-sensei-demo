-- Resend cooldown was measured from `price_confirmation_requested_at`, which the ORIGINAL
-- request also sets. So when the first guide email failed, the advisor was locked out for
-- 5 minutes from the one action that would fix it — and the UI had already reported
-- "Reminder sent to the guide" because the send was fire-and-forget and never awaited.
--
-- Track the notification separately from the request: cooldown reads last_notified_at, and
-- no successful notification on record means no cooldown at all.

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS price_confirmation_last_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS price_confirmation_notify_error text;

COMMENT ON COLUMN job_applications.price_confirmation_last_notified_at IS
  'Last time the guide price-confirmation email was actually accepted by the mail server. NULL = the guide has never been successfully emailed; resend is never rate-limited in that state.';
COMMENT ON COLUMN job_applications.price_confirmation_notify_error IS
  'Why the last price-confirmation email failed (no email on file, SMTP error). Cleared on the next successful send.';

-- Requests made before this migration were assumed delivered. Treat them as notified at
-- request time so an advisor who is mid-flow is not spammed with a duplicate on first load;
-- anything genuinely stuck is surfaced by scripts/backfill-stuck-booking-requests.ts.
UPDATE job_applications
SET price_confirmation_last_notified_at = price_confirmation_requested_at
WHERE price_confirmation_status = 'requested'
  AND price_confirmation_requested_at IS NOT NULL
  AND price_confirmation_last_notified_at IS NULL;

CREATE INDEX IF NOT EXISTS job_applications_price_confirmation_pending_idx
  ON job_applications (price_confirmation_status, price_confirmation_last_notified_at)
  WHERE price_confirmation_status = 'requested';
