
-- ===== ENUMS =====
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.loan_status AS ENUM (
  'en_attente',
  'accepte',
  'refuse',
  'contrat_envoye',
  'contrat_signe',
  'en_traitement',
  'fonds_disponibles'
);

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===== USER ROLES =====
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ===== LOANS =====
CREATE TABLE public.loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  duration_months INTEGER NOT NULL CHECK (duration_months > 0),
  monthly_income NUMERIC(12,2) NOT NULL CHECK (monthly_income >= 0),
  purpose TEXT,
  status loan_status NOT NULL DEFAULT 'en_attente',
  admin_notes TEXT,
  contract_pdf_path TEXT,
  signed_contract_path TEXT,
  funds_available_at TIMESTAMPTZ,
  withdrawn BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_loans_user_id ON public.loans(user_id);
CREATE INDEX idx_loans_status ON public.loans(status);

-- ===== LOAN DOCUMENTS =====
CREATE TABLE public.loan_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loan_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_loan_documents_loan_id ON public.loan_documents(loan_id);

-- ===== UPDATED_AT TRIGGER FUNCTION =====
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_loans_updated_at
  BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== AUTO-CREATE PROFILE & ROLE ON SIGNUP =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'phone', '')
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== RLS POLICIES: profiles =====
CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ===== RLS POLICIES: user_roles =====
CREATE POLICY "Users view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== RLS POLICIES: loans =====
CREATE POLICY "Users view own loans"
  ON public.loans FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create own loans"
  ON public.loans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own loan limited"
  ON public.loans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins update any loan"
  ON public.loans FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- ===== RLS POLICIES: loan_documents =====
CREATE POLICY "Users view own documents"
  ON public.loan_documents FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users upload own documents"
  ON public.loan_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own documents"
  ON public.loan_documents FOR DELETE
  USING (auth.uid() = user_id);

-- ===== STORAGE BUCKETS =====
INSERT INTO storage.buckets (id, name, public) VALUES ('loan-documents', 'loan-documents', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('contracts', 'contracts', false);

-- Storage policies: loan-documents (path: {user_id}/{loan_id}/{filename})
CREATE POLICY "Users view own loan documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'loan-documents'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Users upload own loan documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'loan-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own loan documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'loan-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies: contracts (path: {user_id}/{loan_id}/{filename})
CREATE POLICY "Users view own contracts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'contracts'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Users upload signed contracts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'contracts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Admins upload contracts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'contracts'
    AND public.has_role(auth.uid(), 'admin')
  );

ALTER TABLE public.loans
ADD COLUMN IF NOT EXISTS withdrawal_beneficiary TEXT,
ADD COLUMN IF NOT EXISTS withdrawal_iban TEXT,
ADD COLUMN IF NOT EXISTS withdrawal_bic TEXT,
ADD COLUMN IF NOT EXISTS withdrawal_bank_name TEXT,
ADD COLUMN IF NOT EXISTS withdrawal_reference TEXT,
ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMP WITH TIME ZONE;

DROP POLICY IF EXISTS "Users view own loan documents files" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own loan documents files" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own loan documents files" ON storage.objects;
DROP POLICY IF EXISTS "Admins view loan documents files" ON storage.objects;
DROP POLICY IF EXISTS "Users view own contract files" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own contract files" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own contract files" ON storage.objects;
DROP POLICY IF EXISTS "Admins view contract files" ON storage.objects;

CREATE POLICY "Users view own loan documents files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'loan-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own loan documents files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'loan-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own loan documents files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'loan-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins view loan documents files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'loan-documents' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users view own contract files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own contract files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own contract files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins view contract files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'contracts' AND public.has_role(auth.uid(), 'admin'::app_role));

-- Table des virements (historique)
CREATE TABLE public.withdrawals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  beneficiary TEXT NOT NULL,
  iban TEXT NOT NULL,
  bic TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'en_traitement',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own withdrawals"
ON public.withdrawals FOR SELECT
USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users create own withdrawals"
ON public.withdrawals FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins update withdrawals"
ON public.withdrawals FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_withdrawals_user ON public.withdrawals(user_id);
CREATE INDEX idx_withdrawals_loan ON public.withdrawals(loan_id);

-- Colonne pour tracker le montant déjà décaissé
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS disbursed_amount NUMERIC NOT NULL DEFAULT 0;

-- Table des codes 2FA admin
CREATE TABLE public.admin_verification_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_verification_codes ENABLE ROW LEVEL SECURITY;

-- Aucune policy : seul le service role accède (depuis server functions)
CREATE INDEX idx_admin_codes_user ON public.admin_verification_codes(user_id, used, expires_at);

-- Table des notifications in-app
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  category TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, read, created_at DESC);

-- Realtime pour notifications + withdrawals + loans
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawals;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

DROP POLICY IF EXISTS "Admins update any profile" ON public.profiles;
CREATE POLICY "Admins update any profile"
  ON public.profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS transfer_kind TEXT NOT NULL DEFAULT 'classique'
    CHECK (transfer_kind IN ('instantane', 'classique')),
  ADD COLUMN IF NOT EXISTS initiated_by TEXT NOT NULL DEFAULT 'client'
    CHECK (initiated_by IN ('client', 'admin'));

DROP POLICY IF EXISTS "Admins create withdrawals" ON public.withdrawals;
CREATE POLICY "Admins create withdrawals"
  ON public.withdrawals FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_profiles_blocked ON public.profiles(blocked) WHERE blocked = true;

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nouveau',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit contact" ON public.contact_messages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Users view own contact" ON public.contact_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all contact" ON public.contact_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- RPC atomique de rejet de virement (recrédit le prêt)
CREATE OR REPLACE FUNCTION public.reject_transfer(_withdrawal_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w RECORD; refund_amount numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO w FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF w.status = 'rejete' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  refund_amount := w.amount;
  UPDATE public.loans
    SET disbursed_amount = GREATEST(0, COALESCE(disbursed_amount,0) - refund_amount),
        withdrawn = false, withdrawn_at = NULL, updated_at = now()
    WHERE id = w.loan_id;
  UPDATE public.withdrawals
    SET status='rejete', processed_at=now(), admin_notes=COALESCE(_reason, admin_notes)
    WHERE id = _withdrawal_id;
  RETURN jsonb_build_object('ok', true, 'refunded', refund_amount);
END; $$;
GRANT EXECUTE ON FUNCTION public.reject_transfer(uuid, text) TO authenticated;

create table if not exists public.loan_status_history (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  user_id uuid not null,
  changed_by uuid,
  old_status public.loan_status,
  new_status public.loan_status not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists loan_status_history_loan_id_idx on public.loan_status_history(loan_id);
create index if not exists loan_status_history_created_at_idx on public.loan_status_history(created_at desc);
alter table public.loan_status_history enable row level security;
drop policy if exists "user reads own history" on public.loan_status_history;
create policy "user reads own history" on public.loan_status_history for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'::app_role));
drop policy if exists "system inserts history" on public.loan_status_history;
create policy "system inserts history" on public.loan_status_history for insert to authenticated with check (true);

create or replace function public._log_loan_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.loan_status_history(loan_id, user_id, changed_by, old_status, new_status, note)
    values (new.id, new.user_id, auth.uid(), null, new.status, 'created');
    return new;
  elsif (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.loan_status_history(loan_id, user_id, changed_by, old_status, new_status, note)
    values (new.id, new.user_id, auth.uid(), old.status, new.status, new.admin_notes);
    return new;
  end if;
  return new;
end $$;

drop trigger if exists trg_loan_status_log on public.loans;
create trigger trg_loan_status_log
  after insert or update of status on public.loans
  for each row execute function public._log_loan_status_change();

-- 2) Push subscriptions (Web Push)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "user manages own push subs" on public.push_subscriptions;
create policy "user manages own push subs" on public.push_subscriptions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "admin reads all push subs" on public.push_subscriptions;
create policy "admin reads all push subs" on public.push_subscriptions for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Contact messages (si manquant)
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  full_name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
drop policy if exists "anyone can submit contact" on public.contact_messages;
create policy "anyone can submit contact" on public.contact_messages for insert to anon, authenticated with check (true);
drop policy if exists "admin reads contact" on public.contact_messages;
create policy "admin reads contact" on public.contact_messages for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) RPC reject_transfer (idempotent)
create or replace function public.reject_transfer(_withdrawal_id uuid, _reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w record; refund_amount numeric;
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then raise exception 'forbidden'; end if;
  select * into w from public.withdrawals where id = _withdrawal_id for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if w.status = 'rejete' then return jsonb_build_object('ok', true, 'already', true); end if;
  refund_amount := w.amount;
  update public.loans
    set disbursed_amount = greatest(0, coalesce(disbursed_amount, 0) - refund_amount),
        withdrawn = false, withdrawn_at = null, updated_at = now()
    where id = w.loan_id;
  update public.withdrawals
    set status = 'rejete', processed_at = now(), admin_notes = coalesce(_reason, admin_notes)
    where id = _withdrawal_id;
  return jsonb_build_object('ok', true, 'refunded', refund_amount);
end $$;
grant execute on function public.reject_transfer(uuid, text) to authenticated;

-- 5) Realtime
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='withdrawals') then
    alter publication supabase_realtime add table public.withdrawals;
  end if;
end $$;
alter table public.notifications replica identity full;
alter table public.withdrawals replica identity full;

ALTER TABLE loans
ADD COLUMN accepted_at timestamptz,
ADD COLUMN contract_sent_at timestamptz,
ADD COLUMN contract_signed_at timestamptz,
ADD COLUMN processing_started_at timestamptz;

UPDATE loans
SET accepted_at = created_at
WHERE status IN (
'accepte',
'contrat_envoye',
'contrat_signe',
'en_traitement',
'fonds_disponibles'
)
AND accepted_at IS NULL;

UPDATE loans
SET contract_sent_at = created_at
WHERE status IN (
'contrat_envoye',
'contrat_signe',
'en_traitement',
'fonds_disponibles'
)
AND contract_sent_at IS NULL;

UPDATE loans
SET contract_signed_at = created_at
WHERE status IN (
'contrat_signe',
'en_traitement',
'fonds_disponibles'
)
AND contract_signed_at IS NULL;

UPDATE loans
SET processing_started_at = created_at
WHERE status IN (
'en_traitement',
'fonds_disponibles'
)
AND processing_started_at IS NULL;

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz default now()
);

select * from notifications order by created_at desc;

create policy "Users can insert own notifications"
on notifications
for insert
to authenticated
with check (auth.uid() = user_id);

select * from notifications order by created_at desc;

create policy "allow insert notifications"
on notifications
for insert
to authenticated
with check (true);

create policy "read own notifications"
on notifications
for select
to authenticated
using (auth.uid() = user_id);

create policy "allow read user_roles"
on user_roles
for select
to authenticated
using (true);

-- =====================================================================
--  VIREMENT 3 ÉTAPES — SCHEMA SUPABASE
--  À exécuter dans : Supabase Dashboard → SQL Editor → New query
-- =====================================================================

-- 1) Colonnes de progression sur withdrawals (idempotent)
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS progress       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_step   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheduled_for  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transfer_kind  TEXT,
  ADD COLUMN IF NOT EXISTS initiated_by   TEXT;

-- 2) Table des codes de déblocage (un par étape par dossier)
CREATE TABLE IF NOT EXISTS public.loan_unlock_codes (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id     UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  step        INTEGER NOT NULL CHECK (step IN (63, 88, 100)),
  fee_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  code        TEXT NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  released    BOOLEAN NOT NULL DEFAULT false,
  released_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loan_id, step)
);

ALTER TABLE public.loan_unlock_codes ENABLE ROW LEVEL SECURITY;

-- Le client ne voit le code QUE lorsque l'admin l'a libéré (released = true).
DROP POLICY IF EXISTS "Users view released codes" ON public.loan_unlock_codes;
CREATE POLICY "Users view released codes"
  ON public.loan_unlock_codes FOR SELECT
  USING (
    (auth.uid() = user_id AND released = true)
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins manage codes" ON public.loan_unlock_codes;
CREATE POLICY "Admins manage codes"
  ON public.loan_unlock_codes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_unlock_loan
  ON public.loan_unlock_codes(loan_id, step);

-- 3) RPC : valide + consomme un code en une seule transaction.
--    Renvoie TRUE si le code était valide (released, non utilisé).
CREATE OR REPLACE FUNCTION public.consume_unlock_code(
  _loan_id UUID,
  _step    INTEGER,
  _code    TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ok BOOLEAN := false;
BEGIN
  UPDATE public.loan_unlock_codes
     SET used = true
   WHERE loan_id = _loan_id
     AND step    = _step
     AND code    = _code
     AND used    = false
     AND released = true
   RETURNING true INTO ok;
  RETURN COALESCE(ok, false);
END $$;

REVOKE ALL ON FUNCTION public.consume_unlock_code(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_unlock_code(UUID, INTEGER, TEXT) TO authenticated;

-- 4) Realtime : notifications déjà publiées dans tes migrations existantes.
--    On ajoute juste les codes pour que le dialog se rafraîchisse en live.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'loan_unlock_codes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_unlock_codes';
  END IF;
END $$;

-- ============================================================================
-- Système de virements bloqués multi-étapes (63% / 88% / 100%)
-- À COLLER DANS L'ÉDITEUR SQL DE VOTRE PROJET SUPABASE.
-- Idempotent : peut être ré-exécuté sans erreur.
-- ============================================================================

-- ===== withdrawals : colonnes manquantes =====
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS transfer_kind TEXT NOT NULL DEFAULT 'instantane',
  ADD COLUMN IF NOT EXISTS initiated_by  TEXT NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS progress      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_step  INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_withdrawals_status_progress
  ON public.withdrawals(status, progress);

-- ===== Table loan_unlock_codes =====
-- Une ligne par (loan_id, step). step ∈ {63, 88, 100}.
CREATE TABLE IF NOT EXISTS public.loan_unlock_codes (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id         UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  step            INTEGER NOT NULL CHECK (step IN (63, 88, 100)),
  fee_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  payment_address TEXT,
  code            TEXT,
  code_version    INTEGER NOT NULL DEFAULT 0,
  released        BOOLEAN NOT NULL DEFAULT false,
  released_at     TIMESTAMPTZ,
  used            BOOLEAN NOT NULL DEFAULT false,
  used_at         TIMESTAMPTZ,
  receipt_path        TEXT,
  receipt_uploaded_at TIMESTAMPTZ,
  receipt_status      TEXT CHECK (receipt_status IN ('pending','approved','rejected')),
  receipt_reviewed_at TIMESTAMPTZ,
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loan_id, step)
);

ALTER TABLE public.loan_unlock_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_unlock_loan ON public.loan_unlock_codes(loan_id);
CREATE INDEX IF NOT EXISTS idx_unlock_user ON public.loan_unlock_codes(user_id);

DROP TRIGGER IF EXISTS trg_unlock_updated_at ON public.loan_unlock_codes;
CREATE TRIGGER trg_unlock_updated_at
  BEFORE UPDATE ON public.loan_unlock_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== RLS loan_unlock_codes =====
DROP POLICY IF EXISTS "Users view own unlock codes" ON public.loan_unlock_codes;
CREATE POLICY "Users view own unlock codes"
  ON public.loan_unlock_codes FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Le client peut UPDATE pour téléverser son reçu (receipt_*).
-- L'écriture du code est protégée par la RPC consume_unlock_code (SECURITY DEFINER)
-- + politique admin pour la régénération.
DROP POLICY IF EXISTS "Users upload own receipt" ON public.loan_unlock_codes;
CREATE POLICY "Users upload own receipt"
  ON public.loan_unlock_codes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage unlock codes" ON public.loan_unlock_codes;
CREATE POLICY "Admins manage unlock codes"
  ON public.loan_unlock_codes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== RPC : consommer un code (validation côté serveur) =====
CREATE OR REPLACE FUNCTION public.consume_unlock_code(
  _loan_id UUID,
  _step    INTEGER,
  _code    TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  SELECT id INTO v_id
  FROM public.loan_unlock_codes
  WHERE loan_id = _loan_id
    AND step = _step
    AND user_id = auth.uid()
    AND released = true
    AND used = false
    AND code IS NOT NULL
    AND upper(replace(code, ' ', '')) = upper(replace(_code, ' ', ''))
  LIMIT 1;

  IF v_id IS NULL THEN RETURN false; END IF;

  UPDATE public.loan_unlock_codes
     SET used = true, used_at = now()
   WHERE id = v_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_unlock_code(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_unlock_code(UUID, INTEGER, TEXT) TO authenticated;

-- ===== Storage bucket transfer-receipts =====
INSERT INTO storage.buckets (id, name, public)
VALUES ('transfer-receipts', 'transfer-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users view own receipts" ON storage.objects;
CREATE POLICY "Users view own receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'transfer-receipts'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "Users upload own receipts" ON storage.objects;
CREATE POLICY "Users upload own receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'transfer-receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own receipts" ON storage.objects;
CREATE POLICY "Users delete own receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'transfer-receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ===== Realtime =====
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND tablename = 'loan_unlock_codes';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_unlock_codes';
  END IF;
END $$;

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===== USER ROLES =====
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ===== LOANS =====
CREATE TABLE public.loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  duration_months INTEGER NOT NULL CHECK (duration_months > 0),
  monthly_income NUMERIC(12,2) NOT NULL CHECK (monthly_income >= 0),
  purpose TEXT,
  status loan_status NOT NULL DEFAULT 'en_attente',
  admin_notes TEXT,
  contract_pdf_path TEXT,
  signed_contract_path TEXT,
  funds_available_at TIMESTAMPTZ,
  withdrawn BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_loans_user_id ON public.loans(user_id);
CREATE INDEX idx_loans_status ON public.loans(status);

-- ===== LOAN DOCUMENTS =====
CREATE TABLE public.loan_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loan_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_loan_documents_loan_id ON public.loan_documents(loan_id);

-- ===== UPDATED_AT TRIGGER FUNCTION =====
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_loans_updated_at
  BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== AUTO-CREATE PROFILE & ROLE ON SIGNUP =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'phone', '')
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== RLS POLICIES: profiles =====
CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ===== RLS POLICIES: user_roles =====
CREATE POLICY "Users view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== RLS POLICIES: loans =====
CREATE POLICY "Users view own loans"
  ON public.loans FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create own loans"
  ON public.loans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own loan limited"
  ON public.loans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins update any loan"
  ON public.loans FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- ===== RLS POLICIES: loan_documents =====
CREATE POLICY "Users view own documents"
  ON public.loan_documents FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users upload own documents"
  ON public.loan_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own documents"
  ON public.loan_documents FOR DELETE
  USING (auth.uid() = user_id);

-- ===== STORAGE BUCKETS =====
INSERT INTO storage.buckets (id, name, public) VALUES ('loan-documents', 'loan-documents', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('contracts', 'contracts', false);

-- Storage policies: loan-documents (path: {user_id}/{loan_id}/{filename})
CREATE POLICY "Users view own loan documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'loan-documents'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Users upload own loan documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'loan-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own loan documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'loan-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies: contracts (path: {user_id}/{loan_id}/{filename})
CREATE POLICY "Users view own contracts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'contracts'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Users upload signed contracts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'contracts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Admins upload contracts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'contracts'
    AND public.has_role(auth.uid(), 'admin')
  );

alter table loan_unlock_codes
add column payment_address text;

alter table loan_unlock_codes
alter column code drop not null;

-- ============================================================================
-- Système de virements bloqués multi-étapes (V2 — bancaire réaliste)
-- À COLLER DANS L'ÉDITEUR SQL DE VOTRE PROJET SUPABASE.
-- Idempotent : peut être ré-exécuté sans erreur.
-- ============================================================================

-- ===== withdrawals : colonnes manquantes =====
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS transfer_kind   TEXT NOT NULL DEFAULT 'instantane',
  ADD COLUMN IF NOT EXISTS initiated_by    TEXT NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS scheduled_for   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS progress        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_step    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS step_started_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_withdrawals_status_progress
  ON public.withdrawals(status, progress);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user
  ON public.withdrawals(user_id, created_at DESC);

-- ===== Table loan_unlock_codes (avec coordonnées bancaires séparées) =====
CREATE TABLE IF NOT EXISTS public.loan_unlock_codes (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id         UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  step            INTEGER NOT NULL CHECK (step IN (63, 88, 100)),
  fee_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  payment_address TEXT,                    -- legacy
  account_holder  TEXT,
  iban            TEXT,
  bic             TEXT,
  description     TEXT,
  code            TEXT,
  code_version    INTEGER NOT NULL DEFAULT 0,
  released        BOOLEAN NOT NULL DEFAULT false,
  released_at     TIMESTAMPTZ,
  used            BOOLEAN NOT NULL DEFAULT false,
  used_at         TIMESTAMPTZ,
  receipt_path        TEXT,
  receipt_uploaded_at TIMESTAMPTZ,
  receipt_status      TEXT CHECK (receipt_status IN ('pending','approved','rejected')),
  receipt_reviewed_at TIMESTAMPTZ,
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loan_id, step)
);

-- Migration douce si la table existait déjà sans les nouveaux champs
ALTER TABLE public.loan_unlock_codes
  ADD COLUMN IF NOT EXISTS account_holder TEXT,
  ADD COLUMN IF NOT EXISTS iban           TEXT,
  ADD COLUMN IF NOT EXISTS bic            TEXT,
  ADD COLUMN IF NOT EXISTS description    TEXT;

ALTER TABLE public.loan_unlock_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_unlock_loan ON public.loan_unlock_codes(loan_id);
CREATE INDEX IF NOT EXISTS idx_unlock_user ON public.loan_unlock_codes(user_id);

DROP TRIGGER IF EXISTS trg_unlock_updated_at ON public.loan_unlock_codes;
CREATE TRIGGER trg_unlock_updated_at
  BEFORE UPDATE ON public.loan_unlock_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== RLS loan_unlock_codes =====
DROP POLICY IF EXISTS "Users view own unlock codes" ON public.loan_unlock_codes;
CREATE POLICY "Users view own unlock codes"
  ON public.loan_unlock_codes FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users upload own receipt" ON public.loan_unlock_codes;
CREATE POLICY "Users upload own receipt"
  ON public.loan_unlock_codes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage unlock codes" ON public.loan_unlock_codes;
CREATE POLICY "Admins manage unlock codes"
  ON public.loan_unlock_codes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== RPC : consommer un code (validation côté serveur) =====
CREATE OR REPLACE FUNCTION public.consume_unlock_code(
  _loan_id UUID,
  _step    INTEGER,
  _code    TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  SELECT id INTO v_id
  FROM public.loan_unlock_codes
  WHERE loan_id = _loan_id
    AND step = _step
    AND user_id = auth.uid()
    AND released = true
    AND used = false
    AND code IS NOT NULL
    AND upper(replace(code, ' ', '')) = upper(replace(_code, ' ', ''))
  LIMIT 1;

  IF v_id IS NULL THEN RETURN false; END IF;

  UPDATE public.loan_unlock_codes
     SET used = true, used_at = now()
   WHERE id = v_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_unlock_code(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_unlock_code(UUID, INTEGER, TEXT) TO authenticated;

-- ===== Storage bucket transfer-receipts =====
INSERT INTO storage.buckets (id, name, public)
VALUES ('transfer-receipts', 'transfer-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users view own receipts" ON storage.objects;
CREATE POLICY "Users view own receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'transfer-receipts'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "Users upload own receipts" ON storage.objects;
CREATE POLICY "Users upload own receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'transfer-receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own receipts" ON storage.objects;
CREATE POLICY "Users delete own receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'transfer-receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ===== Realtime =====
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND tablename = 'loan_unlock_codes';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_unlock_codes';
  END IF;

  PERFORM 1 FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND tablename = 'withdrawals';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawals';
  END IF;
END $$;

ALTER TABLE loan_unlock_codes
ADD COLUMN receipt_path TEXT;

ALTER TABLE loan_unlock_codes
ADD COLUMN IF NOT EXISTS receipt_path TEXT,
ADD COLUMN IF NOT EXISTS receipt_status TEXT,
ADD COLUMN IF NOT EXISTS receipt_uploaded_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS reviewed_by UUID,
ADD COLUMN IF NOT EXISTS admin_note TEXT;

ALTER TABLE public.loan_unlock_codes
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();

SELECT * 
FROM pg_trigger
WHERE tgrelid = 'loan_unlock_codes'::regclass;

DROP TRIGGER IF EXISTS set_updated_at ON loan_unlock_codes;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON loan_unlock_codes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.loan_unlock_codes;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.loan_unlock_codes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

alter table loan_unlock_codes
add column if not exists receipt_path text;

alter table loan_unlock_codes
add column if not exists receipt_status text default 'pending';

alter table loan_unlock_codes
add column if not exists receipt_uploaded_at timestamptz;

alter table loan_unlock_codes
add column if not exists updated_at timestamptz default now();

ALTER TABLE loan_unlock_codes
ADD COLUMN IF NOT EXISTS code_version integer NOT NULL DEFAULT 1;

ALTER TABLE loan_unlock_codes
ADD COLUMN IF NOT EXISTS used_at timestamptz NULL;

ALTER TABLE loan_unlock_codes
ADD COLUMN IF NOT EXISTS receipt_reviewed_at timestamptz NULL;

ALTER TABLE public.withdrawals REPLICA IDENTITY FULL;
ALTER TABLE public.loan_unlock_codes REPLICA IDENTITY FULL;
ALTER TABLE public.loan_status_history REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.loans REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_unlock_codes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_status_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.loans;

CREATE OR REPLACE FUNCTION public.advance_transfer_with_unlock_code(_withdrawal_id uuid, _code text)
RETURNS TABLE(success boolean, message text, current_step integer, progress integer, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_withdrawal public.withdrawals%ROWTYPE;
  v_code public.loan_unlock_codes%ROWTYPE;
  v_target integer;
  v_next_step integer;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::integer, NULL::integer, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.withdrawals
  WHERE id = _withdrawal_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'withdrawal_not_found', NULL::integer, NULL::integer, NULL::text;
    RETURN;
  END IF;

  IF v_withdrawal.status IN ('envoye', 'validated') OR v_withdrawal.current_step >= 3 THEN
    RETURN QUERY SELECT true, 'already_completed', v_withdrawal.current_step, v_withdrawal.progress, v_withdrawal.status;
    RETURN;
  END IF;

  IF v_withdrawal.status IN ('rejete', 'rejected', 'cancelled') THEN
    RETURN QUERY SELECT false, 'withdrawal_rejected', v_withdrawal.current_step, v_withdrawal.progress, v_withdrawal.status;
    RETURN;
  END IF;

  v_target := CASE v_withdrawal.current_step
    WHEN 0 THEN 63
    WHEN 1 THEN 88
    WHEN 2 THEN 100
    ELSE 100
  END;

  IF COALESCE(v_withdrawal.progress, 0) < v_target THEN
    RETURN QUERY SELECT false, 'step_not_reached', v_withdrawal.current_step, v_withdrawal.progress, v_withdrawal.status;
    RETURN;
  END IF;

  SELECT * INTO v_code
  FROM public.loan_unlock_codes
  WHERE loan_id = v_withdrawal.loan_id
    AND user_id = auth.uid()
    AND step = v_target
    AND released = true
    AND used = false
    AND code IS NOT NULL
    AND upper(replace(code, ' ', '')) = upper(replace(_code, ' ', ''))
  ORDER BY released_at DESC NULLS LAST, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_code', v_withdrawal.current_step, v_withdrawal.progress, v_withdrawal.status;
    RETURN;
  END IF;

  UPDATE public.loan_unlock_codes
  SET used = true,
      used_at = v_now,
      updated_at = v_now
  WHERE id = v_code.id;

  v_next_step := v_withdrawal.current_step + 1;

  IF v_next_step >= 3 THEN
    UPDATE public.withdrawals
    SET current_step = 3,
        progress = 100,
        status = 'envoye',
        step_started_at = v_now,
        processed_at = v_now
    WHERE id = v_withdrawal.id;
  ELSE
    UPDATE public.withdrawals
    SET current_step = v_next_step,
        progress = v_target,
        status = 'en_traitement',
        step_started_at = v_now,
        processed_at = NULL
    WHERE id = v_withdrawal.id;
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.withdrawals
  WHERE id = _withdrawal_id;

  RETURN QUERY SELECT true, 'advanced', v_withdrawal.current_step, v_withdrawal.progress, v_withdrawal.status;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_transfer_with_unlock_code(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_transfer_with_unlock_code(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_transfer_with_unlock_code(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.advance_transfer_with_unlock_code(_withdrawal_id uuid, _code text)
RETURNS TABLE(success boolean, message text, current_step integer, progress integer, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_withdrawal public.withdrawals%ROWTYPE;
  v_code public.loan_unlock_codes%ROWTYPE;
  v_target integer;
  v_next_step integer;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::integer, NULL::integer, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.withdrawals
  WHERE id = _withdrawal_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'withdrawal_not_found', NULL::integer, NULL::integer, NULL::text;
    RETURN;
  END IF;

  IF v_withdrawal.status IN ('envoye', 'validated') OR v_withdrawal.current_step >= 3 THEN
    RETURN QUERY SELECT true, 'already_completed', v_withdrawal.current_step, v_withdrawal.progress, v_withdrawal.status;
    RETURN;
  END IF;

  IF v_withdrawal.status IN ('rejete', 'rejected', 'cancelled') THEN
    RETURN QUERY SELECT false, 'withdrawal_rejected', v_withdrawal.current_step, v_withdrawal.progress, v_withdrawal.status;
    RETURN;
  END IF;

  v_target := CASE v_withdrawal.current_step
    WHEN 0 THEN 63
    WHEN 1 THEN 88
    WHEN 2 THEN 100
    ELSE 100
  END;

  -- CORRECTION IMPORTANTE
  IF COALESCE(v_withdrawal.progress, 0) < (v_target - 2) THEN
    RETURN QUERY SELECT false, 'step_not_reached', v_withdrawal.current_step, v_withdrawal.progress, v_withdrawal.status;
    RETURN;
  END IF;

  SELECT * INTO v_code
  FROM public.loan_unlock_codes
  WHERE loan_id = v_withdrawal.loan_id
    AND user_id = auth.uid()
    AND step = v_target
    AND released = true
    AND used = false
    AND code IS NOT NULL
    AND upper(replace(code, ' ', '')) = upper(replace(_code, ' ', ''))
  ORDER BY released_at DESC NULLS LAST, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_code', v_withdrawal.current_step, v_withdrawal.progress, v_withdrawal.status;
    RETURN;
  END IF;

  UPDATE public.loan_unlock_codes
  SET used = true,
      used_at = v_now,
      updated_at = v_now
  WHERE id = v_code.id;

  v_next_step := v_withdrawal.current_step + 1;

  IF v_next_step >= 3 THEN
    UPDATE public.withdrawals
    SET current_step = 3,
        progress = 100,
        status = 'envoye',
        step_started_at = v_now,
        processed_at = v_now
    WHERE id = v_withdrawal.id;
  ELSE
    UPDATE public.withdrawals
    SET current_step = v_next_step,
        progress = v_target,
        status = 'en_traitement',
        step_started_at = v_now,
        processed_at = NULL
    WHERE id = v_withdrawal.id;
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.withdrawals
  WHERE id = _withdrawal_id;

  RETURN QUERY SELECT true, 'advanced', v_withdrawal.current_step, v_withdrawal.progress, v_withdrawal.status;
END;
$$;

CREATE POLICY "Users can update own withdrawals progress"
ON public.withdrawals
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'fr';
COMMENT ON COLUMN public.profiles.language IS 'Preferred UI/notification language code (fr, en, de, es, it, nl, sl, bg, sk)';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, phone, language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'phone', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'lang', ''), 'fr')
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$function$;

ALTER TABLE contact_messages
ADD COLUMN sent_email boolean DEFAULT false;


CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  sent_email BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT INSERT ON public.contact_messages TO anon;
GRANT ALL ON public.contact_messages TO service_role;

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a contact message"
  ON public.contact_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view all contact messages"
  ON public.contact_messages FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update contact messages"
  ON public.contact_messages FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON public.contact_messages(created_at DESC);


-- =========================================================
-- TRUSTED DEVICES
-- =========================================================
CREATE TABLE public.trusted_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  label TEXT,
  browser TEXT,
  os TEXT,
  ip_address TEXT,
  country TEXT,
  trusted BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, fingerprint)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trusted_devices TO authenticated;
GRANT ALL ON public.trusted_devices TO service_role;
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own devices" ON public.trusted_devices
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_trusted_devices_user ON public.trusted_devices(user_id);
CREATE INDEX idx_trusted_devices_fp ON public.trusted_devices(fingerprint);

-- =========================================================
-- SECURITY LOGS
-- =========================================================
CREATE TABLE public.security_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  device_fingerprint TEXT,
  browser TEXT,
  os TEXT,
  country TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.security_logs TO authenticated;
GRANT ALL ON public.security_logs TO service_role;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own logs" ON public.security_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users read own logs" ON public.security_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_security_logs_user ON public.security_logs(user_id, created_at DESC);
CREATE INDEX idx_security_logs_action ON public.security_logs(action, created_at DESC);

-- =========================================================
-- USER BEHAVIOR
-- =========================================================
CREATE TABLE public.user_behavior (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  session_count INT NOT NULL DEFAULT 0,
  total_session_seconds BIGINT NOT NULL DEFAULT 0,
  click_count BIGINT NOT NULL DEFAULT 0,
  pages_visited JSONB NOT NULL DEFAULT '[]'::jsonb,
  sensitive_action_count INT NOT NULL DEFAULT 0,
  last_sensitive_action_at TIMESTAMPTZ,
  risk_score INT NOT NULL DEFAULT 0,
  last_country TEXT,
  last_fingerprint TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_behavior TO authenticated;
GRANT ALL ON public.user_behavior TO service_role;
ALTER TABLE public.user_behavior ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own behavior" ON public.user_behavior
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- SECURITY ALERTS
-- =========================================================
CREATE TABLE public.security_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low',
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.security_alerts TO authenticated;
GRANT ALL ON public.security_alerts TO service_role;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own alerts" ON public.security_alerts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own alerts" ON public.security_alerts
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Admins update alerts" ON public.security_alerts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_alerts_user ON public.security_alerts(user_id, created_at DESC);

-- Updated-at triggers
CREATE TRIGGER update_trusted_devices_updated_at
  BEFORE UPDATE ON public.trusted_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_behavior_updated_at
  BEFORE UPDATE ON public.user_behavior
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
