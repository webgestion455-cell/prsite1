-- =========================================================================
--  BNP PARIBAS — Live Chat Pro V2 (à exécuter APRÈS SQL_LIVE_CHAT.sql)
--
--  Ajoute :
--   - Numérotation ticket (#BNP-YYYY-XXXXXX)
--   - Colonnes guest (visiteurs non-connectés via edge function)
--   - Pièces jointes (jsonb) et audio (transcript + url)
--   - Notes internes admin (invisibles côté client)
--   - Fermeture ticket (par qui, raison)
--   - Vue chat_clients_grouped pour la sidebar admin
-- =========================================================================

-- ============ ALTER : chat_conversations ============
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS is_guest       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_name     text,
  ADD COLUMN IF NOT EXISTS guest_email    text,
  ADD COLUMN IF NOT EXISTS guest_phone    text,
  ADD COLUMN IF NOT EXISTS guest_whatsapp text,
  ADD COLUMN IF NOT EXISTS guest_country  text,
  ADD COLUMN IF NOT EXISTS priority       text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS closed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_reason  text,
  ADD COLUMN IF NOT EXISTS admin_notes    text,
  ADD COLUMN IF NOT EXISTS ticket_number  text UNIQUE;

-- user_id nullable pour les guests
ALTER TABLE public.chat_conversations
  ALTER COLUMN user_id DROP NOT NULL;

-- ============ Séquence + génération ticket_number ============
CREATE SEQUENCE IF NOT EXISTS public.chat_ticket_seq START 1000;

CREATE OR REPLACE FUNCTION public.chat_gen_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := 'BNP-' || to_char(now(), 'YYYY') || '-' ||
                         lpad(nextval('public.chat_ticket_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_chat_gen_ticket ON public.chat_conversations;
CREATE TRIGGER trg_chat_gen_ticket
BEFORE INSERT ON public.chat_conversations
FOR EACH ROW EXECUTE FUNCTION public.chat_gen_ticket_number();

-- Numéroter le rétroactif
UPDATE public.chat_conversations
   SET ticket_number = 'BNP-' || to_char(created_at, 'YYYY') || '-' ||
                       lpad(nextval('public.chat_ticket_seq')::text, 6, '0')
 WHERE ticket_number IS NULL;

-- ============ ALTER : chat_messages ============
-- Ajoute les pièces jointes, audio, HTML flag, note interne, lu
DO $$ BEGIN
  ALTER TYPE public.chat_sender ADD VALUE IF NOT EXISTS 'admin_note';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachments      jsonb,        -- [{kind,url,mime,size,name}]
  ADD COLUMN IF NOT EXISTS audio_url        text,
  ADD COLUMN IF NOT EXISTS audio_transcript text,
  ADD COLUMN IF NOT EXISTS is_html          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS read_at          timestamptz;

-- ============ RLS : masquer les admin_note côté client ============
DROP POLICY IF EXISTS "chat_msg_select_own_or_admin" ON public.chat_messages;
CREATE POLICY "chat_msg_select_own_or_admin"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (c.user_id = auth.uid() AND chat_messages.sender_type <> 'admin_note')
        )
    )
  );

-- ============ Vue admin : clients regroupés ============
CREATE OR REPLACE VIEW public.chat_admin_folders AS
SELECT
  COALESCE(c.user_id::text, 'guest:' || c.id::text)          AS folder_key,
  c.user_id,
  c.is_guest,
  COALESCE(p.full_name, c.guest_name, c.guest_email, 'Guest') AS folder_name,
  COALESCE(u.email, c.guest_email)                            AS folder_email,
  COUNT(*) FILTER (WHERE c.status <> 'closed')                AS open_count,
  COUNT(*) FILTER (WHERE c.status = 'closed')                 AS closed_count,
  MAX(c.last_message_at)                                      AS last_activity,
  SUM(c.unread_agent)                                         AS unread_total
FROM public.chat_conversations c
LEFT JOIN public.profiles p ON p.id = c.user_id
LEFT JOIN auth.users     u ON u.id = c.user_id
GROUP BY 1,2,3,4,5;

GRANT SELECT ON public.chat_admin_folders TO authenticated;

-- Masquer via RLS-like : filtre au niveau requête, admins seulement (côté app)
-- (Vue non-RLS ; le front la lit uniquement pour les admins)

-- ============ STORAGE : bucket chat-attachments ============
-- (créer via UI ou via storage.buckets)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Policies : client authentifié peut uploader dans son propre dossier (conv id),
-- admin peut lire/écrire tout.
DROP POLICY IF EXISTS "chat_att_read"   ON storage.objects;
DROP POLICY IF EXISTS "chat_att_write"  ON storage.objects;

CREATE POLICY "chat_att_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.chat_conversations c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND c.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "chat_att_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.chat_conversations c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND c.user_id = auth.uid()
      )
    )
  );

-- ============ Notification helper ============
COMMENT ON TABLE public.chat_conversations IS
  'BNP Live Chat Pro V2 — tickets numérotés, guests, priorité, historique persistant.';

-- ============ GUEST : anon peut lire ses conversations/messages ============
-- (le UUID de conversation sert de capability token, stocké en localStorage.
--  Les inserts guest passent par les edge functions service_role.)
GRANT SELECT ON public.chat_conversations TO anon;
GRANT SELECT ON public.chat_messages      TO anon;

DROP POLICY IF EXISTS "chat_conv_select_guest" ON public.chat_conversations;
CREATE POLICY "chat_conv_select_guest"
  ON public.chat_conversations FOR SELECT
  TO anon
  USING (is_guest = true);

DROP POLICY IF EXISTS "chat_msg_select_guest" ON public.chat_messages;
CREATE POLICY "chat_msg_select_guest"
  ON public.chat_messages FOR SELECT
  TO anon
  USING (
    sender_type <> 'admin_note'
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_messages.conversation_id AND c.is_guest = true
    )
  );
