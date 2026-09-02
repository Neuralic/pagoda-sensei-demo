-- Phase 1 security basics: auth brute-force counters + privileged-action audit.

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  bucket text PRIMARY KEY,
  hit_count int NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_id text,
  target_user_id text,
  target_role text,
  ip text,
  user_agent text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_audit_log_created_idx
  ON public.security_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS security_audit_log_event_idx
  ON public.security_audit_log (event_type, created_at DESC);

COMMENT ON TABLE public.auth_rate_limits IS
  'Sliding-window counters for login / password-reset / register brute-force limits';

COMMENT ON TABLE public.security_audit_log IS
  'Privileged actions (admin impersonation start/stop) for support accountability';
