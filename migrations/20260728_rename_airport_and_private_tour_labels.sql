-- Align stored activity labels with the tour-list menu order/labels:
--   Private Tour
--   Airport transfers - Instant Confirmation
--   Airport transfers - Custom
--   Transfers
--   Shinkansen Tickets (bullet train)
--   Food Tours
--   Special Accommodation
--   Free Time
-- Table name is `tour` (singular), not `tours`.

UPDATE tour
SET activity_type = 'Private Tour'
WHERE lower(trim(activity_type)) IN ('private tour', 'private tours');

UPDATE jobs
SET activity_type = 'Private Tour'
WHERE lower(trim(activity_type)) IN ('private tour', 'private tours');

UPDATE tour
SET activity_type = 'Airport transfers - Instant Confirmation'
WHERE lower(trim(activity_type)) IN (
  'airport transfers',
  'airport transfer',
  'instant confirmation airport transfers',
  'airport transfers - instant confirmation'
);

UPDATE jobs
SET activity_type = 'Airport transfers - Instant Confirmation'
WHERE lower(trim(activity_type)) IN (
  'airport transfers',
  'airport transfer',
  'instant confirmation airport transfers',
  'airport transfers - instant confirmation'
);

UPDATE tour
SET activity_type = 'Airport transfers - Custom'
WHERE lower(trim(activity_type)) IN (
  'custom airport transfers',
  'airport transfers - custom'
);

UPDATE jobs
SET activity_type = 'Airport transfers - Custom'
WHERE lower(trim(activity_type)) IN (
  'custom airport transfers',
  'airport transfers - custom'
);

UPDATE tour
SET activity_type = 'Shinkansen Tickets (bullet train)'
WHERE lower(trim(activity_type)) = 'shinkansen tickets';

UPDATE jobs
SET activity_type = 'Shinkansen Tickets (bullet train)'
WHERE lower(trim(activity_type)) = 'shinkansen tickets';
