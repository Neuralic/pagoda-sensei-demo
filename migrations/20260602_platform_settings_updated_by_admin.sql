-- Admins live in `admin`, not `users`. Drop invalid FK so saves from the admin panel work.

ALTER TABLE public.platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_updated_by_fkey;

ALTER TABLE public.platform_settings
  ADD CONSTRAINT platform_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.admin(id) ON DELETE SET NULL;
