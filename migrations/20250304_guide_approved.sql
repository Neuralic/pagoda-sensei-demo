-- Guide approval: new guides require admin approval before they can perform any activity.
-- Only applies to users with role = 'guide'. Agents are not subject to approval.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS guide_approved boolean NOT NULL DEFAULT false;

-- Existing guides are considered approved so they are not blocked.
UPDATE users SET guide_approved = true WHERE role = 'guide';
