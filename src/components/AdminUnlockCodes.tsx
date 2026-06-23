import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  KeyRound,
  Send,
  CheckCircle2,
  Lock,
  RefreshCw,
  Save,
  FileText,
  XCircle,
  Eye,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { formatCurrency } from "@/lib/loan-helpers";
import { notifyUser } from "@/lib/notifications";

interface UnlockCodeRow {
  id: string;
  loan_id: string;
  user_id: string;
  step: number;
  fee_amount: number;
  payment_address: string | null;
  account_holder: string | null;
  iban: string | null;
  bic: string | null;
  description: string | null;
  code: string | null;
  code_version: number;
  released: boolean;
  released_at: string | null;
  used: boolean;
  receipt_path: string | null;
  receipt_uploaded_at: string | null;
  receipt_status: "pending" | "approved" | "rejected" | null;
  receipt_reviewed_at: string | null;
  admin_notes: string | null;
}

interface LoanLite {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  amount: number;
  status?: string;
}

const STEPS = [63, 88, 100] as const;

function rndCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join("");
  return `${pick(4)}-${pick(4)}`;
}

const ALLOWED_AFTER = new Set([
  "accepte",
  "acceptee",
  "accepted",
  "approuve",
  "approuvee",
  "contrat_envoye",
  "contrat_signe",
  "en_traitement",
  "fonds_disponibles",
]);

function normalizeStatus(status?: string | null) {
  return String(status ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function AdminUnlockCodes({ loan }: { loan: LoanLite }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<UnlockCodeRow[]>([]);
  type Draft = { fee: string; account_holder: string; iban: string; bic: string; description: string };
  const emptyDraft: Draft = { fee: "", account_holder: "", iban: "", bic: "", description: "" };
  const [draft, setDraft] = useState<Record<number, Draft>>({
    63: { ...emptyDraft }, 88: { ...emptyDraft }, 100: { ...emptyDraft },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loan?.id) return;
    void load();
    const ch = supabase
      .channel(`admin-unlock-${loan.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loan_unlock_codes", filter: `loan_id=eq.${loan.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan?.id]);

  const gateOpen = ALLOWED_AFTER.has(normalizeStatus(loan.status));

  async function load() {
    const { data } = await supabase
      .from("loan_unlock_codes" as any)
      .select("*")
      .eq("loan_id", loan.id)
      .order("step");
    const list = (data as unknown as UnlockCodeRow[]) ?? [];
    setRows(list);
    setDraft((prev) => {
      const next = { ...prev };
      for (const s of STEPS) {
        const r = list.find((x) => x.step === s);
        if (r) {
          next[s] = {
            fee: r.fee_amount?.toString() ?? "",
            account_holder: r.account_holder ?? "",
            iban: r.iban ?? r.payment_address ?? "",
            bic: r.bic ?? "",
            description: r.description ?? "",
          };
        }
      }
      return next;
    });

    // Pré-charge URLs signées des reçus
    const urls: Record<string, string> = {};
    await Promise.all(
      list
        .filter((r) => r.receipt_path)
        .map(async (r) => {
          const { data: signed } = await supabase.storage
            .from("transfer-receipts")
            .createSignedUrl(r.receipt_path!, 3600);
          if (signed?.signedUrl) urls[r.id] = signed.signedUrl;
        }),
    );
    setReceiptUrls(urls);
  }

  function bankPayloadFromDraft(step: number) {
    const d = draft[step];
    return {
      account_holder: d.account_holder.trim() || null,
      iban: d.iban.replace(/\s+/g, "").toUpperCase() || null,
      bic: d.bic.replace(/\s+/g, "").toUpperCase() || null,
      description: d.description.trim() || null,
      // legacy alias for backward compatibility
      payment_address: d.iban.replace(/\s+/g, "").toUpperCase() || null,
    };
  }

  async function saveConfig(step: number) {
    const fee = Number(draft[step].fee);
    if (!Number.isFinite(fee) || fee < 0) {
      toast.error(t("adminCodes.invalidFee", "Frais invalides"));
      return;
    }
    setBusy(`save-${step}`);
    const existing = rows.find((r) => r.step === step);
    const bank = bankPayloadFromDraft(step);
    if (existing) {
      const { error } = await supabase
        .from("loan_unlock_codes" as any)
        .update({ fee_amount: fee, ...bank })
        .eq("id", existing.id);
      if (error) toast.error(error.message);
      else toast.success(t("adminCodes.saved", "Configuration enregistrée"));
    } else {
      const { error } = await supabase.from("loan_unlock_codes" as any).insert({
        loan_id: loan.id,
        user_id: loan.user_id,
        step,
        fee_amount: fee,
        ...bank,
      });
      if (error) toast.error(error.message);
      else toast.success(t("adminCodes.saved", "Configuration enregistrée"));
    }
    setBusy(null);
    void load();
  }

  async function generateAndSend(step: number) {
    const existing = rows.find((r) => r.step === step);
    const fee = Number(existing?.fee_amount ?? draft[step].fee);
    if (!Number.isFinite(fee) || fee < 0) {
      toast.error(t("adminCodes.invalidFee", "Frais invalides"));
      return;
    }
    setBusy(`gen-${step}`);
    const newCode = rndCode();
    const bank = bankPayloadFromDraft(step);
    if (existing) {
      await supabase
        .from("loan_unlock_codes" as any)
        .update({
          code: newCode,
          code_version: (existing.code_version ?? 0) + 1,
          released: true,
          released_at: new Date().toISOString(),
          used: false,
          used_at: null,
          fee_amount: fee,
          ...bank,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("loan_unlock_codes" as any).insert({
        loan_id: loan.id,
        user_id: loan.user_id,
        step,
        fee_amount: fee,
        ...bank,
        code: newCode,
        code_version: 1,
        released: true,
        released_at: new Date().toISOString(),
      });
    }
    await notifyUser({
      userId: loan.user_id,
      titleKey: "notif.adminCodes.codeTitle",
      messageKey: "notif.adminCodes.codeMsg",
      params: { p: step, code: newCode, fee: formatCurrency(fee) },
      link: "/transfers",
      category: "success",
    });
    setBusy(null);
    toast.success(t("adminCodes.codeSent", "Code généré et envoyé"));
    void load();
  }

  async function reviewReceipt(row: UnlockCodeRow, status: "approved" | "rejected") {
  setBusy(`review-${row.id}`);

  // =========================
  // CAS REFUS
  // =========================
  if (status === "rejected") {
    await supabase
      .from("loan_unlock_codes" as any)
      .update({
        receipt_status: "rejected",
        receipt_reviewed_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    await notifyUser({
      userId: loan.user_id,
      titleKey: "notif.adminCodes.rejectedTitle",
      messageKey: "notif.adminCodes.rejectedMsg",
      link: "/transfers",
      category: "warning",
    });

    toast.success("Reçu refusé");
    setBusy(null);
    void load();
    return;
  }

  // =========================
  // CAS APPROUVÉ
  // =========================

  const generatedCode = rndCode();

  const { error } = await supabase
    .from("loan_unlock_codes" as any)
    .update({
      receipt_status: "approved",
      receipt_reviewed_at: new Date().toISOString(),

      // IMPORTANT
      code: generatedCode,
      released: true,
      released_at: new Date().toISOString(),
      used: false,

      code_version: (row.code_version ?? 0) + 1,
    })
    .eq("id", row.id);

  if (error) {
    toast.error(error.message);
    setBusy(null);
    return;
  }

  await notifyUser({
    userId: loan.user_id,
    titleKey: "notif.adminCodes.manualCodeTitle",
    messageKey: "notif.adminCodes.manualCodeMsg",
    params: { p: row.step, code: generatedCode },
    link: "/transfers",
    category: "success",
  });

  toast.success("Code généré et envoyé");

  setBusy(null);

  void load();
}

  if (!gateOpen) {
    return (
      <Card className="mt-6 border-dashed">
        <CardContent className="p-5 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="font-semibold">{t("adminCodes.gatedTitle", "Configuration verrouillée")}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                "adminCodes.gatedDesc",
                "La configuration des étapes de virement devient disponible après acceptation du prêt.",
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> {t("adminCodes.sectionTitle", "Configuration des étapes de virement")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t(
            "adminCodes.sectionHelp",
            "Définissez les frais et l'adresse de paiement par étape, validez le reçu, puis envoyez le code.",
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {STEPS.map((step) => {
          const r = rows.find((x) => x.step === step);
          const d = draft[step];
          const receiptUrl = r?.id ? receiptUrls[r.id] : undefined;
          return (
            <div key={step} className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono">
                    {step}%
                  </Badge>
                  {r?.released && !r.used && (
                    <Badge className="bg-info/10 text-info">
                      v{r.code_version} · {t("adminCodes.released", "Envoyé")}
                    </Badge>
                  )}
                  {r?.used && (
                    <Badge className="bg-success/10 text-success gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {t("adminCodes.consumed", "Consommé")}
                    </Badge>
                  )}
                </div>
                {r?.code && (
                  <code className="rounded bg-secondary px-2 py-1 text-xs font-mono">
                    {r.code}
                  </code>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t("adminCodes.fee", "Frais (€)")}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={d.fee}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, [step]: { ...p[step], fee: e.target.value } }))
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("adminCodes.holder", "Titulaire du compte")}</Label>
                  <Input
                    value={d.account_holder}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, [step]: { ...p[step], account_holder: e.target.value } }))
                    }
                    placeholder="Nom du titulaire"
                    className="mt-1.5"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">{t("adminCodes.iban", "IBAN")}</Label>
                  <Input
                    value={d.iban}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, [step]: { ...p[step], iban: e.target.value.toUpperCase() } }))
                    }
                    placeholder="FR76 1234 …"
                    className="mt-1.5 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("adminCodes.bic", "BIC / SWIFT")}</Label>
                  <Input
                    value={d.bic}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, [step]: { ...p[step], bic: e.target.value.toUpperCase() } }))
                    }
                    placeholder="BNPXFR…"
                    className="mt-1.5 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("adminCodes.description", "Motif / Description")}</Label>
                  <Input
                    value={d.description}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, [step]: { ...p[step], description: e.target.value } }))
                    }
                    placeholder="Frais conformité — réf."
                    className="mt-1.5"
                  />
                </div>
              </div>

              {/* Reçu uploadé par le client */}
              {r?.receipt_path && (
                <div className="rounded-lg bg-secondary/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <FileText className="h-4 w-4" />
                      {t("adminCodes.receiptUploaded", "Reçu téléversé")}
                      {r.receipt_status === "pending" && (
                        <Badge className="bg-warning/15 text-warning">
                          {t("adminCodes.pending", "En attente")}
                        </Badge>
                      )}
                      {r.receipt_status === "approved" && (
                        <Badge className="bg-success/15 text-success">
                          {t("adminCodes.approved", "Approuvé")}
                        </Badge>
                      )}
                      {r.receipt_status === "rejected" && (
                        <Badge className="bg-destructive/15 text-destructive">
                          {t("adminCodes.rejected", "Refusé")}
                        </Badge>
                      )}
                    </div>
                    {receiptUrl && (
                      <a
                        href={receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        <Eye className="h-3 w-3" /> {t("common.view", "Voir")}
                      </a>
                    )}
                  </div>
                  {(r.receipt_status === "pending" || r.receipt_status === null) && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled={busy === `review-${r.id}`}
                        onClick={() => reviewReceipt(r, "rejected")}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        {t("adminCodes.reject", "Refuser")}
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={busy === `review-${r.id}`}
                        onClick={() => reviewReceipt(r, "approved")}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        {t("adminCodes.approve", "Approuver")}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveConfig(step)}
                  disabled={busy === `save-${step}`}
                >
                  {busy === `save-${step}` ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  {t("common.save", "Enregistrer")}
                </Button>
                <Button
                  size="sm"
                  className="shadow-glow"
                  onClick={() => generateAndSend(step)}
                  disabled={busy === `gen-${step}`}
                >
                  {busy === `gen-${step}` ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : r?.code ? (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  ) : (
                    <Send className="h-4 w-4 mr-1" />
                  )}
                  {r?.code
                    ? t("adminCodes.regenerateAndSend", "Régénérer et envoyer")
                    : t("adminCodes.generateAndSend", "Générer et envoyer")}
                </Button>
              </div>
            </div>
          );
        })}

        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
          <Lock className="h-3 w-3 mt-0.5" />
          {t(
            "adminCodes.invalidates",
            "Régénérer un code invalide automatiquement l'ancien : seul le dernier code émis fonctionne.",
          )}
        </p>
      </CardContent>
    </Card>
  );
}
