-- The API-connected Airport Transfers category is now "Instant Confirmation Airport
-- Transfers" (a separate "Custom Airport Transfers" category covers partner-sourced
-- transfers). Existing rows all belong to the API-connected category.
-- Table name is `tour` (singular), not `tours`.

UPDATE tour
SET activity_type = 'Instant Confirmation Airport Transfers'
WHERE lower(trim(activity_type)) IN ('airport transfers', 'airport transfer');

UPDATE jobs
SET activity_type = 'Instant Confirmation Airport Transfers'
WHERE lower(trim(activity_type)) IN ('airport transfers', 'airport transfer');
