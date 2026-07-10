-- =========================================================================
--  BNP PARIBAS — Live Chat Pro (à exécuter dans Supabase SQL Editor)
--  Tables : chat_conversations, chat_messages, chat_typing
--  Sécurité : RLS + policies (client = ses propres conversations, admin = tout)
--  Realtime : chat_messages + chat_conversations
-- =========================================================================

-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.chat_status AS ENUM ('open', 'waiting_agent', 'assigned', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.chat_sender AS ENUM ('client', 'bot', 'agent', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ TABLE : chat_conversations ============
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status              public.chat_status NOT NULL DEFAULT 'open',
  assigned_agent_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_agent_name text,
  subject             text NOT NULL DEFAULT 'Assistance',
  country_code        text,
  timezone            text,
  last_message_at     timestamptz NOT NULL DEFAULT now(),
  unread_client       integer NOT NULL DEFAULT 0,
  unread_agent        integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  closed_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_user       ON public.chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_status     ON public.chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_conv_last_msg   ON public.chat_conversations(last_message_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.chat_conversations TO authenticated;
GRANT ALL ON public.chat_conversations TO service_role;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conv_select_own_or_admin" ON public.chat_conversations;
CREATE POLICY "chat_conv_select_own_or_admin"
  ON public.chat_conversations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "chat_conv_insert_self" ON public.chat_conversations;
CREATE POLICY "chat_conv_insert_self"
  ON public.chat_conversations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "chat_conv_update_own_or_admin" ON public.chat_conversations;
CREATE POLICY "chat_conv_update_own_or_admin"
  ON public.chat_conversations FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ TABLE : chat_messages ============
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_type     public.chat_sender NOT NULL,
  sender_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name     text,
  content_html    text NOT NULL,
  content_text    text,
  format          text NOT NULL DEFAULT 'html',
  meta            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv       ON public.chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_msg_created    ON public.chat_messages(created_at DESC);

GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_msg_select_own_or_admin" ON public.chat_messages;
CREATE POLICY "chat_msg_select_own_or_admin"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND (c.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

DROP POLICY IF EXISTS "chat_msg_insert_own_or_admin" ON public.chat_messages;
CREATE POLICY "chat_msg_insert_own_or_admin"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ============ TABLE : chat_typing (présence "en train d'écrire") ============
CREATE TABLE IF NOT EXISTS public.chat_typing (
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE CASCADE NOT NULL,
  actor_type      public.chat_sender NOT NULL,
  actor_id        uuid,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, actor_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_typing TO authenticated;
GRANT ALL ON public.chat_typing TO service_role;

ALTER TABLE public.chat_typing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_typing_all_participants" ON public.chat_typing;
CREATE POLICY "chat_typing_all_participants"
  ON public.chat_typing FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_typing.conversation_id
        AND (c.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ============ TRIGGER : maj last_message_at + compteurs non-lus ============
CREATE OR REPLACE FUNCTION public.chat_bump_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_conversations
     SET last_message_at = NEW.created_at,
         unread_client   = CASE WHEN NEW.sender_type IN ('agent','bot','system')
                                THEN unread_client + 1 ELSE unread_client END,
         unread_agent    = CASE WHEN NEW.sender_type = 'client'
                                THEN unread_agent + 1 ELSE unread_agent END
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_chat_bump_conversation ON public.chat_messages;
CREATE TRIGGER trg_chat_bump_conversation
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.chat_bump_conversation();

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_typing;
