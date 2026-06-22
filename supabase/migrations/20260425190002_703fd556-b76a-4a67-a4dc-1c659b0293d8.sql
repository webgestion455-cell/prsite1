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