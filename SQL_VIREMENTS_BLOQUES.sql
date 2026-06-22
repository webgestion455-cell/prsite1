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
