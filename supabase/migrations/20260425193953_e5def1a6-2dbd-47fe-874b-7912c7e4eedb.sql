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