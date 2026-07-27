-- =====================================================================
-- BNP PARIBAS — RBAC multi-administrateurs / agents + Paramètres bancaires
-- À exécuter dans le SQL Editor Supabase (idempotent, ré-exécutable).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Rôles : ajout de super_admin et agent à l'enum existant app_role
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'super_admin') THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'agent') THEN
    ALTER TYPE public.app_role ADD VALUE 'agent';
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------
-- 2. Catalogue de permissions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissions (
  key         text PRIMARY KEY,
  module      text NOT NULL,
  label       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL    ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read permissions" ON public.permissions;
CREATE POLICY "staff read permissions" ON public.permissions
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.permissions (key, module, label) VALUES
  ('dashboard.view',    'Pilotage',   'Voir le tableau de bord'),
  ('clients.view',      'Clients',    'Consulter les clients'),
  ('clients.manage',    'Clients',    'Modifier / bloquer un client'),
  ('loans.view',        'Crédits',    'Consulter les demandes de prêt'),
  ('loans.decide',      'Crédits',    'Accepter / refuser / envoyer un contrat'),
  ('transfers.view',    'Virements',  'Consulter les virements'),
  ('transfers.execute', 'Virements',  'Exécuter / rejeter un virement'),
  ('invoices.view',     'Facturation','Consulter les factures et justificatifs'),
  ('chat.view',         'Assistance', 'Accéder à la messagerie'),
  ('chat.reply',        'Assistance', 'Répondre aux clients'),
  ('notifications.send','Assistance', 'Envoyer des notifications'),
  ('security.view',     'Sécurité',   'Consulter les alertes de sécurité'),
  ('logs.view',         'Sécurité',   'Consulter le journal d''activité'),
  ('staff.view',        'Équipe',     'Voir les membres de l''équipe'),
  ('staff.manage',      'Équipe',     'Inviter / révoquer un membre'),
  ('roles.manage',      'Équipe',     'Modifier la matrice des permissions'),
  ('settings.manage',   'Paramètres', 'Configurer les moyens de paiement')
ON CONFLICT (key) DO UPDATE SET module = EXCLUDED.module, label = EXCLUDED.label;

-- ---------------------------------------------------------------------
-- 3. Matrice rôle -> permission
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role           public.app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_key)
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL    ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read role_permissions" ON public.role_permissions;
CREATE POLICY "staff read role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------
-- 4. Fonctions de sécurité (SECURITY DEFINER, anti-récursion RLS)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('super_admin', 'admin', 'agent')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission_key = _permission
  );
$$;

CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE (permission_key text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.key
  FROM public.permissions p
  WHERE public.is_super_admin(auth.uid())
  UNION
  SELECT rp.permission_key
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role = ur.role
  WHERE ur.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.is_staff(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions()              TO authenticated;

-- Écriture de la matrice réservée aux super admins
DROP POLICY IF EXISTS "super admin writes role_permissions" ON public.role_permissions;
CREATE POLICY "super admin writes role_permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Permissions par défaut
-- ---------------------------------------------------------------------
-- super_admin : tout (implicite via is_super_admin, mais on remplit pour l'UI)
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'super_admin'::public.app_role, key FROM public.permissions
ON CONFLICT DO NOTHING;

-- admin : tout sauf gestion d'équipe / rôles
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin'::public.app_role, key FROM public.permissions
WHERE key NOT IN ('staff.manage', 'roles.manage')
ON CONFLICT DO NOTHING;

-- agent : assistance + lecture
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'agent'::public.app_role, key FROM public.permissions
WHERE key IN ('dashboard.view','clients.view','loans.view','transfers.view',
              'invoices.view','chat.view','chat.reply','notifications.send')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. Profils staff (nom affiché, fonction, statut)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  job_title    text,
  phone        text,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.staff_profiles TO authenticated;
GRANT ALL ON public.staff_profiles TO service_role;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read staff_profiles" ON public.staff_profiles;
CREATE POLICY "staff read staff_profiles" ON public.staff_profiles
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "self update staff_profiles" ON public.staff_profiles;
CREATE POLICY "self update staff_profiles" ON public.staff_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "super admin insert staff_profiles" ON public.staff_profiles;
CREATE POLICY "super admin insert staff_profiles" ON public.staff_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_super_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 7. Invitations d'équipe
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  role        public.app_role NOT NULL DEFAULT 'agent',
  full_name   text,
  job_title   text,
  token_hash  text NOT NULL,
  invited_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_invitations_email_idx ON public.staff_invitations (lower(email));

GRANT SELECT ON public.staff_invitations TO authenticated;
GRANT ALL    ON public.staff_invitations TO service_role;
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read invitations" ON public.staff_invitations;
CREATE POLICY "staff read invitations" ON public.staff_invitations
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'staff.view'));

-- ---------------------------------------------------------------------
-- 8. Journal d'activité (audit)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_created_idx ON public.activity_logs (created_at DESC);

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read activity_logs" ON public.activity_logs;
CREATE POLICY "staff read activity_logs" ON public.activity_logs
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'logs.view'));

DROP POLICY IF EXISTS "staff insert activity_logs" ON public.activity_logs;
CREATE POLICY "staff insert activity_logs" ON public.activity_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id AND public.is_staff(auth.uid()));

-- ---------------------------------------------------------------------
-- 9. Moyens de paiement configurables (Visa, IBAN, QR, crypto, ...)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL,                       -- 'bank_transfer' | 'card' | 'qr' | 'crypto' | 'other'
  label        text NOT NULL,
  holder       text,
  iban         text,
  bic          text,
  bank_name    text,
  card_brand   text,                                -- 'visa' | 'mastercard' | ...
  card_last4   text,
  address      text,                                -- crypto wallet / adresse de paiement
  network      text,                                -- réseau crypto
  qr_url       text,
  instructions text,
  currency     text NOT NULL DEFAULT 'EUR',
  active       boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_methods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read active payment_methods" ON public.payment_methods;
CREATE POLICY "public read active payment_methods" ON public.payment_methods
  FOR SELECT TO anon, authenticated USING (active = true OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff manage payment_methods" ON public.payment_methods;
CREATE POLICY "staff manage payment_methods" ON public.payment_methods
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'settings.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.manage'));

-- ---------------------------------------------------------------------
-- 10. Promotion du compte historique en super_admin
-- ---------------------------------------------------------------------
DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = 'cardservice.bnpparibas@gmail.com' LIMIT 1;
  IF uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.staff_profiles (user_id, display_name, job_title)
    VALUES (uid, 'Administrateur principal', 'Super administrateur')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;
