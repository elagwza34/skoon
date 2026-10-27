-- Add user_sessions table for single-active-session enforcement
-- Production schema change. Review and apply via Supabase migrations UI.

-- Create the user_sessions table to track application-level session records
CREATE TABLE IF NOT EXISTS user_sessions (
  id              VARCHAR(22)    NOT NULL,
  user_id         UUID           NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_info     VARCHAR(255),
  ip_address      VARCHAR(45),
  supabase_session_id UUID,
  is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
  last_activity_at TIMESTAMP      NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMP      NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP      NOT NULL DEFAULT NOW(),
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_user_id_key UNIQUE (user_id)
);

-- Index for fast lookup of a user's session record
CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS user_sessions_user_id_active_idx ON user_sessions (user_id, is_active);

-- Update triggered when a new session record is inserted
CREATE OR REPLACE FUNCTION public.update_user_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_sessions_updated_at ON public.user_sessions;
CREATE TRIGGER user_sessions_updated_at
BEFORE UPDATE ON public.user_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_user_sessions_updated_at();

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_sessions FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_user_sessions_updated_at() FROM PUBLIC;
