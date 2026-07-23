-- Migration: 066_outlook_delegated_oauth.sql
-- Purpose: Support personal Outlook/Hotmail accounts with encrypted delegated OAuth

ALTER TABLE public.outlook_connections
  ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'application'
    CHECK (auth_mode IN ('application', 'delegated')),
  ADD COLUMN microsoft_user_id TEXT,
  ADD COLUMN refresh_token_ciphertext TEXT,
  ADD COLUMN token_scopes TEXT,
  ADD COLUMN authorized_at TIMESTAMPTZ,
  ADD CONSTRAINT outlook_connections_encrypted_token_shape CHECK (
    refresh_token_ciphertext IS NULL OR refresh_token_ciphertext LIKE 'v1.%'
  );

COMMENT ON COLUMN public.outlook_connections.refresh_token_ciphertext IS
  'Refresh token OAuth cifrado con AES-256-GCM; solo service_role puede leer esta tabla.';
COMMENT ON COLUMN public.outlook_connections.microsoft_user_id IS
  'Identificador opaco devuelto por Microsoft Graph para impedir conectar otra cuenta por error.';

-- Preserve the original view column order and append only safe authorization
-- metadata. No token, delta URL, lock owner or Microsoft user id is exposed.
CREATE OR REPLACE VIEW public.outlook_sync_status
WITH (security_invoker = false) AS
SELECT
  id,
  mailbox,
  calendar_id,
  enabled,
  subscription_expires_at,
  last_synced_at,
  last_sync_ok,
  last_error,
  updated_at,
  auth_mode,
  (auth_mode = 'application' OR refresh_token_ciphertext IS NOT NULL) AS authorized
FROM public.outlook_connections
WHERE public.get_user_role() IN ('admin', 'medico', 'enfermera', 'secretaria');

GRANT SELECT ON public.outlook_sync_status TO authenticated;
