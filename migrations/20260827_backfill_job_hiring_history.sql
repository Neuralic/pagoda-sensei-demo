-- Bookings confirmed while finalize-official-booking omitted `application_id` never got a
-- job_hiring_history row (23502, swallowed and logged only). The application says "confirmed"
-- but dashboards, guide stats, tour sold counts and pending reviews all read hiring history,
-- so those bookings are invisible to them. Backfill the missing rows.
--
-- Production `job_hiring_history.final_price` is NOT NULL — omitting it fails the insert (23502).
--
-- Timestamps: recovered rows must carry the date the booking was actually confirmed, not the
-- date this migration ran, or every historic booking appears to have happened on backfill day.
--
-- Idempotent: safe to re-run. Only inserts rows that are missing, only corrects timestamps
-- that were stamped at backfill time.

INSERT INTO job_hiring_history (
  job_id,
  application_id,
  agent_id,
  guide_id,
  final_price,
  offer_accepted_at,
  is_closed
)
SELECT
  ja.job_id,
  ja.id,
  j.created_by,
  ja.applicant_id,
  COALESCE(ja.guide_price, ja.quoted_guide_price_at_request),
  COALESCE(ja.price_confirmed_at, ja.invoice_requested_at, now()),
  false
FROM job_applications ja
JOIN jobs j ON j.id = ja.job_id
WHERE ja.price_confirmation_status = 'confirmed'
  AND ja.applicant_id IS NOT NULL
  AND j.created_by IS NOT NULL
  AND COALESCE(ja.guide_price, ja.quoted_guide_price_at_request) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM job_hiring_history h
    WHERE h.job_id = ja.job_id
      AND h.is_closed = false
  );

-- Restore the real confirmation dates on backfilled rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_hiring_history' AND column_name = 'created_at'
  ) THEN
    UPDATE job_hiring_history h
    SET
      created_at = ja.price_confirmed_at,
      offer_accepted_at = COALESCE(h.offer_accepted_at, ja.price_confirmed_at)
    FROM job_applications ja
    WHERE h.application_id = ja.id
      AND ja.price_confirmed_at IS NOT NULL
      -- Only rows this backfill created: confirmed long before the history row appeared.
      AND h.created_at > ja.price_confirmed_at + interval '1 hour';
  END IF;
END $$;
