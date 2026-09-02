-- Pagoda Pro / advisor UI: USD beside JPY uses a configurable FX protection buffer (default 3%).
-- Partner JPY prices are never overwritten; this only affects USD display estimates.

INSERT INTO public.platform_settings (key, value_json)
VALUES ('fx_protection_pct', '3'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.platform_settings IS
  'Singleton-style key/value platform configuration (Transferz commission, FX protection %, etc.)';
