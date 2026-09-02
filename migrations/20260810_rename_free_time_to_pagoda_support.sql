-- Rename activity type "Free Time" → "Pagoda Support"
-- Keep filter/canonicalize aliases for any leftover rows.

UPDATE tour
SET activity_type = 'Pagoda Support'
WHERE lower(trim(activity_type)) IN ('free time', 'pagoda support');

UPDATE jobs
SET activity_type = 'Pagoda Support'
WHERE lower(trim(activity_type)) IN ('free time', 'pagoda support');
