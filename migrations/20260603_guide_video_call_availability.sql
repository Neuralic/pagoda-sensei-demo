-- Guide availability for live video calls with travel advisors (alternative to intro video upload).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS available_for_video_call boolean;

COMMENT ON COLUMN profiles.available_for_video_call IS
  'Whether the guide is willing to do a video call with a travel advisor (yes/no).';
