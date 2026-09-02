-- Guides need somewhere to put costs they pay on the client's behalf — Shinkansen tickets
-- above all, which almost every advisor books.
--
-- Without this the only place to put a ticket is the guide's own price, and Pagoda's
-- marketplace and agent commission would then apply to it: on a ¥76,580 fare that is ¥19,145
-- of commission on money Pagoda merely passed through, and a client paying well over the face
-- value printed on the ticket.
--
-- Passed through at cost: added to the price after commission, never inside it.

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS pass_through_cost numeric,
  ADD COLUMN IF NOT EXISTS pass_through_note text;

COMMENT ON COLUMN job_applications.pass_through_cost IS
  'Total the guide pays on the client''s behalf (train tickets, entrance fees). Added to the client price at cost — no marketplace or agent commission is charged on it.';
COMMENT ON COLUMN job_applications.pass_through_note IS
  'What the pass-through cost covers, e.g. "2 x Shinkansen Tokyo-Kyoto reserved". Shown to the advisor and on the invoice request.';
