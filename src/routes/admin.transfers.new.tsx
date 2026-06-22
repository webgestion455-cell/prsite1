import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, Send, Zap, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/loan-helpers";
import { notifyUser } from "@/lib/notifications";

const ADMIN_EMAIL = "hsbcadmin5@gmail.com";

const searchSchema = z.object({ userId: z.string().optional(), loanId: z.string().optional() });

export const Route = createFileRoute("/admin/transfers/new")({
  validateSearch: searchSchema,
  component: AdminNewTransfer,
  head: () => ({ meta: [{ title: "Nouveau virement — Admin" }] }),
});

interface ProfileLite { user_id: string; full_name: string | null; email: string | null; }
interface LoanLite {
  id: string;
  user_id: string;
  amount: number;
  disbursed_amount: number;
  full_name: string;
}

function AdminNewTransfer() {
  const { t } = useTranslation();
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [loans, setLoans] = useState<LoanLite[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [kind, setKind] = useState<"instantane" | "classique">("instantane");
  const [userId, setUserId] = useState<string>(search.userId ?? "");
  const [loanId, setLoanId] = useState<string>(search.loanId ?? "");
  const [amount, setAmount] = useState<string>("");
  const [beneficiary, setBeneficiary] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [bankName, setBankName] = useState("");
  const [reference, setReference] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.email !== ADMIN_EMAIL || role !== "admin") {
      navigate({ to: "/admin/verify", replace: true });
    }
  }, [user, role, authLoading, navigate]);

  useEffect(() => {
    if (role !== "admin") return;
    void load();
  }, [role]);

  async function load() {
    setLoading(true);
    const [pRes, lRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email").order("full_name"),
      supabase
        .from("loans")
        .select("id, user_id, amount, disbursed_amount, full_name")
        .order("created_at", { ascending: false }),
    ]);
    setProfiles((pRes.data as ProfileLite[]) ?? []);
    setLoans((lRes.data as LoanLite[]) ?? []);
    setLoading(false);
  }

  const selectedClientLoans = useMemo(
    () => loans.filter((l) => l.user_id === userId),
    [loans, userId],
  );
  const selectedLoan = loans.find((l) => l.id === loanId);

  // Auto-populate beneficiary when client picked
  useEffect(() => {
    if (!userId) return;
    const p = profiles.find((p) => p.user_id === userId);
    if (p && !beneficiary) setBeneficiary(p.full_name ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profiles.length]);

  // Auto-pick loan if a single one (only when client changes)
  useEffect(() => {
    if (!loanId && selectedClientLoans.length === 1) setLoanId(selectedClientLoans[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedClientLoans.length]);

  async function submit() {
    if (!userId || !loanId || !amount || !beneficiary || !iban || !bic || !bankName) {
      toast.error("Tous les champs obligatoires doivent être remplis");
      return;
    }
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Montant invalide");
      return;
    }
    setBusy(true);
    const ref = reference.trim() || `VIR-${Date.now().toString(36).toUpperCase()}`;
    const insertPayload: Record<string, unknown> = {
      loan_id: loanId,
      user_id: userId,
      amount: amt,
      beneficiary: beneficiary.trim(),
      iban: iban.trim().replace(/\s+/g, ""),
      bic: bic.trim(),
      bank_name: bankName.trim(),
      reference: ref,
      admin_notes: adminNotes.trim() || null,
      transfer_kind: kind,
      initiated_by: "admin",
      // Instantané = exécuté immédiatement, Classique = en traitement
      status: kind === "instantane" ? "envoye" : "en_traitement",
      processed_at: kind === "instantane" ? new Date().toISOString() : null,
    };
    const { data: inserted, error } = await (supabase.from("withdrawals") as any)
      .insert(insertPayload)
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      toast.error(error.message || t("admin.transfer.error"));
      return;
    }

    const newId: string = inserted?.id;
    // Notification au client — redirige vers le détail du virement
    await notifyUser({
      userId,
      titleKey: kind === "instantane" ? "notif.transfer.instantTitle" : "notif.transfer.classicTitle",
      messageKey: kind === "instantane" ? "notif.transfer.instantMsg" : "notif.transfer.classicMsg",
      params: {
        amount: formatCurrency(amt),
        iban4: iban.slice(0, 4),
        ibanLast: iban.slice(-4),
        ref,
      },
      category: "success",
      link: newId ? `/transfers/${newId}` : "/transfers",
    });

    setBusy(false);
    toast.success(t("admin.transfer.success"));
    navigate({ to: "/admin/clients/$userId", params: { userId } });
  }

  if (authLoading || role !== "admin") {
    return <div className="flex items-center justify-center h-96 text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl pb-28 lg:pb-10">
      <div className="flex items-center gap-3 mb-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> {t("common.back")}</Link>
        </Button>
      </div>

      <h1 className="text-3xl font-serif text-primary mb-1">{t("admin.transfer.title")}</h1>
      <p className="text-muted-foreground mb-8">{t("admin.transfer.subtitle")}</p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.transfer.kind")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup value={kind} onValueChange={(v) => setKind(v as "instantane" | "classique")} className="grid sm:grid-cols-2 gap-3">
            <label
              htmlFor="kind-instant"
              className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${kind === "instantane" ? "border-primary bg-primary/5 shadow-glow" : "border-border hover:border-primary/40"}`}
            >
              <RadioGroupItem value="instantane" id="kind-instant" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  <Zap className="h-4 w-4 text-warning" /> {t("admin.transfer.instant")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("admin.transfer.instantHint")}</p>
              </div>
            </label>
            <label
              htmlFor="kind-classic"
              className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${kind === "classique" ? "border-primary bg-primary/5 shadow-glow" : "border-border hover:border-primary/40"}`}
            >
              <RadioGroupItem value="classique" id="kind-classic" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  <Clock className="h-4 w-4 text-info" /> {t("admin.transfer.classic")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("admin.transfer.classicHint")}</p>
              </div>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>{t("admin.transfer.client")} *</Label>
              <Select value={userId} onValueChange={(v) => { setUserId(v); setLoanId(""); }} disabled={loading}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder={t("admin.transfer.selectClient")} /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.full_name || p.email} {p.full_name && p.email ? `· ${p.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("admin.transfer.loan")} *</Label>
              <Select value={loanId} onValueChange={setLoanId} disabled={!userId || selectedClientLoans.length === 0}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder={t("admin.transfer.selectLoan")} /></SelectTrigger>
                <SelectContent>
                  {selectedClientLoans.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {formatCurrency(Number(l.amount))} · {l.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedLoan && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Décaissé : {formatCurrency(Number(selectedLoan.disbursed_amount))} / {formatCurrency(Number(selectedLoan.amount))}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label>{t("admin.transfer.amount")} *</Label>
            <Input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>{t("admin.transfer.beneficiary")} *</Label>
              <Input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>{t("admin.transfer.bankName")} *</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <div className="grid sm:grid-cols-[2fr_1fr] gap-4">
            <div>
              <Label>{t("admin.transfer.iban")} *</Label>
              <Input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} className="mt-1.5 font-mono" placeholder="FR76 1234…" />
            </div>
            <div>
              <Label>{t("admin.transfer.bic")} *</Label>
              <Input value={bic} onChange={(e) => setBic(e.target.value.toUpperCase())} className="mt-1.5 font-mono" placeholder="HSBCFR…" />
            </div>
          </div>

          <div>
            <Label>{t("admin.transfer.reference")}</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1.5" placeholder="Auto-généré si vide" />
          </div>

          <div>
            <Label>Note interne (optionnelle)</Label>
            <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={2} maxLength={500} className="mt-1.5" />
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button variant="ghost" onClick={() => navigate({ to: "/admin" })} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} disabled={busy} className="shadow-glow">
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              {t("admin.transfer.submit")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
