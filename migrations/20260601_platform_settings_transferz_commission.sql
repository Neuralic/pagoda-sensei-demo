-- Platform-wide settings (key/value). Used for Transferz markup % editable in admin.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.admin(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.platform_settings IS 'Singleton-style key/value platform configuration';
COMMENT ON COLUMN public.platform_settings.value_json IS 'JSON scalar or object; Transferz commission stores a number (percent)';

INSERT INTO public.platform_settings (key, value_json)
VALUES ('transferz_platform_commission_pct', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;
