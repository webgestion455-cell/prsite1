import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, Send, Zap, Clock, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/loan-helpers";
import { notifyAllAdmins } from "@/lib/notifications";
import { z } from "zod";

interface LoanLite {
  id: string;
  amount: number;
  disbursed_amount: number;
  status: string;
}

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pré-sélection éventuelle du prêt */
  initialLoanId?: string | null;
  loans: LoanLite[];
  /** Callback après création réussie */
  onSuccess?: () => void;
  defaultBeneficiary?: string;
}

const ibanRe = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const bicRe = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/;

export function TransferDialog({
  open,
  onClose,
  initialLoanId,
  loans,
  onSuccess,
  defaultBeneficiary,
}: TransferDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const eligibleLoans = useMemo(
    () =>
      loans.filter(
        (l) =>
          l.status === "fonds_disponibles" &&
          Number(l.amount) - Number(l.disbursed_amount ?? 0) > 0,
      ),
    [loans],
  );

  const [kind, setKind] = useState<"instantane" | "classique">("instantane");
  const [loanId, setLoanId] = useState<string>(initialLoanId ?? eligibleLoans[0]?.id ?? "");
  const [amount, setAmount] = useState<string>("");
  const [beneficiary, setBeneficiary] = useState<string>(defaultBeneficiary ?? "");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [bankName, setBankName] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [busy, setBusy] = useState(false);
  

  // Reset SEULEMENT à l'ouverture du dialog. Sinon les champs se vident
  // dès qu'un parent re-render (Realtime, etc.) car `eligibleLoans` change de référence.
  useEffect(() => {
    if (!open) return;
    setLoanId(initialLoanId ?? eligibleLoans[0]?.id ?? "");
    setKind("instantane");
    setAmount("");
    setIban("");
    setBic("");
    setBankName("");
    setReference("");
    setReason("");
    setScheduledFor("");
    setBeneficiary(defaultBeneficiary ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedLoan = loans.find((l) => l.id === loanId);
  const remaining = selectedLoan
    ? Number(selectedLoan.amount) - Number(selectedLoan.disbursed_amount ?? 0)
    : 0;

  if (!open) return null;

  async function submit() {
    if (!user) return;
    if (!loanId) {
      toast.error(t("transfer.noLoanSelected"));
      return;
    }
    const schema = z.object({
      amount: z.coerce
        .number()
        .positive(t("transfer.amountInvalid"))
        .max(remaining, `${t("common.amount")} ≤ ${formatCurrency(remaining)}`),
      beneficiary: z.string().trim().min(2, t("transfer.beneficiaryRequired")).max(120),
      iban: z
        .string()
        .trim()
        .transform((v) => v.replace(/\s/g, "").toUpperCase())
        .pipe(z.string().regex(ibanRe, t("transfer.ibanInvalid"))),
      bic: z
        .string()
        .trim()
        .transform((v) => v.replace(/\s/g, "").toUpperCase())
        .pipe(z.string().regex(bicRe, t("transfer.bicInvalid"))),
      bankName: z.string().trim().min(2, t("transfer.bankRequired")).max(120),
    });
    const parsed = schema.safeParse({ amount, beneficiary, iban, bic, bankName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    if (kind === "classique" && scheduledFor) {
      const sch = new Date(scheduledFor);
      if (isNaN(sch.getTime()) || sch.getTime() < Date.now() - 60_000) {
        toast.error(t("transfer.scheduleFuture"));
        return;
      }
    }

    setBusy(true);
    const ref = reference.trim() || `VIR-${Date.now().toString(36).toUpperCase()}`;

    const payload: Record<string, unknown> = {
      loan_id: loanId,
      user_id: user.id,
      amount: parsed.data.amount,
      beneficiary: parsed.data.beneficiary,
      iban: parsed.data.iban,
      bic: parsed.data.bic,
      bank_name: parsed.data.bankName,
      reference: ref,
      transfer_kind: kind,
      initiated_by: "client",
      status: "en_traitement",
      progress: 0,
      current_step: 0,
      processed_at: null,
      scheduled_for:
        kind === "classique" && scheduledFor ? new Date(scheduledFor).toISOString() : null,
      admin_notes: reason.trim() || null,
    };

    const { data: inserted, error } = await (supabase.from("withdrawals") as any)
      .insert(payload)
      .select("id")
      .single();

    setBusy(false);

    if (error || !inserted) {
      toast.error(error?.message || t("transfer.errorEmit"));
      return;
    }

    await notifyAllAdmins({
      titleKey: "notif.transfer.adminInitTitle",
      messageKey: "notif.transfer.adminInitMsg",
      params: {
        amount: formatCurrency(parsed.data.amount),
        beneficiary: parsed.data.beneficiary,
        ref,
      },
      link: `/admin/clients/${user.id}`,
      category: "info",
    });

    toast.success(kind === "instantane" ? t("transfer.successInstant") : t("transfer.successClassic"));
    onSuccess?.();
    onClose();
    navigate({ to: "/transfers/$transferId", params: { transferId: (inserted as { id: string }).id } });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-1" /> {t("common.back")}
          </Button>
        </div>
        <h3 className="font-serif text-2xl text-primary">{t("transfer.title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("transfer.subtitle")}
        </p>

        {/* Kind */}
        <Card className="mt-5">
          <CardContent className="p-4">
            <RadioGroup
              value={kind}
              onValueChange={(v) => setKind(v as "instantane" | "classique")}
              className="grid sm:grid-cols-2 gap-3"
            >
              <label
                htmlFor="kind-instant"
                className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${kind === "instantane" ? "border-primary bg-primary/5 shadow-glow" : "border-border hover:border-primary/40"}`}
              >
                <RadioGroupItem value="instantane" id="kind-instant" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <Zap className="h-4 w-4 text-warning" /> {t("transfer.kindInstant")}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("transfer.kindInstantHint")}
                  </p>
                </div>
              </label>
              <label
                htmlFor="kind-classic"
                className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${kind === "classique" ? "border-primary bg-primary/5 shadow-glow" : "border-border hover:border-primary/40"}`}
              >
                <RadioGroupItem value="classique" id="kind-classic" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <Clock className="h-4 w-4 text-info" /> {t("transfer.kindClassic")}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("transfer.kindClassicHint")}
                  </p>
                </div>
              </label>
            </RadioGroup>
          </CardContent>
        </Card>

        <div className="mt-5 space-y-4">
          {eligibleLoans.length > 1 && (
            <div>
              <Label>{t("transfer.sourceLoan")}</Label>
              <Select value={loanId} onValueChange={setLoanId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eligibleLoans.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {formatCurrency(Number(l.amount))} · {l.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>{t("transfer.amount")} *</Label>
              <Input
                type="number"
                min={1}
                step="0.01"
                max={remaining}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("transfer.available")} : {formatCurrency(remaining)}
              </p>
            </div>
            <div>
              <Label>{t("transfer.beneficiary")} *</Label>
              <Input
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
                className="mt-1.5"
                placeholder={t("transfer.beneficiaryPlaceholder")}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-[2fr_1fr] gap-4">
            <div>
              <Label>{t("transfer.iban")} *</Label>
              <Input
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
                className="mt-1.5 font-mono"
                placeholder="FR76 1234 …"
              />
            </div>
            <div>
              <Label>{t("transfer.bic")} *</Label>
              <Input
                value={bic}
                onChange={(e) => setBic(e.target.value.toUpperCase())}
                className="mt-1.5 font-mono"
                placeholder="HSBCFR…"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>{t("transfer.bankName")} *</Label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="mt-1.5"
                placeholder={t("transfer.bankNamePlaceholder")}
              />
            </div>
            <div>
              <Label>{t("transfer.reference")}</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="mt-1.5"
                placeholder={t("transfer.referencePlaceholder")}
              />
            </div>
          </div>

          {kind === "classique" && (
            <div>
              <Label>{t("transfer.schedule")}</Label>
              <Input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("transfer.scheduleHint")}
              </p>
            </div>
          )}

          <div>
            <Label>{t("transfer.reason")}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1.5"
              placeholder={t("transfer.reasonPlaceholder")}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-success" />
          {kind === "instantane" ? t("transfer.secureInstant") : t("transfer.secureClassic")}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={busy} className="shadow-glow">
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            {kind === "instantane" ? t("transfer.executeInstant") : t("transfer.confirmClassic")}
          </Button>
        </div>

      </div>
    </div>
  );
}
