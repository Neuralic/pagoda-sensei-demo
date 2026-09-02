-- Align stored tour activity labels with the new canonical name.
-- Table name is `tour` (singular), not `tours`.

UPDATE tour
SET activity_type = 'Private Tours'
WHERE lower(trim(activity_type)) = 'private tour';

UPDATE jobs
SET activity_type = 'Private Tours'
WHERE lower(trim(activity_type)) = 'private tour';
