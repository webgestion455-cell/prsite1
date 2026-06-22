import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate, formatDateTime, type LoanStatus } from "@/lib/loan-helpers";
import { LoanStepper, LOAN_STATUS_META, TONE_CLASSES } from "@/lib/loan-stepper";
import { generateContractPdf } from "@/lib/contract-pdf.functions";
import {
  ArrowLeft, Download, Upload, FileText, AlertTriangle, Loader2, CheckCircle2, Check,
  History, Wallet, Send,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TransferDialog } from "@/components/TransferDialog";
import i18n from "@/i18n";

export const Route = createFileRoute("/loans/$loanId")({
  component: LoanDetail,
  head: () => ({ meta: [{ title: i18n.t("loanDetail.metaTitle") }] }),
});

interface Loan {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  amount: number;
  duration_months: number;
  monthly_income: number;
  purpose: string | null;
  status: LoanStatus;
  admin_notes: string | null;
  contract_pdf_path: string | null;
  signed_contract_path: string | null;
  created_at: string;
  accepted_at: string | null;
  contract_sent_at: string | null;
  contract_signed_at: string | null;
  processing_started_at: string | null;
  funds_available_at: string | null;
  disbursed_amount: number;
  updated_at: string;
}

interface DocRow {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  message: string;
  created_at: string;
  old_status: LoanStatus | null;
  new_status: LoanStatus;
}

function LoanDetail() {
  const { t } = useTranslation();
  const { loanId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [history, setHistory] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [withdrawLoanId, setWithdrawLoanId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase
      .channel(`loan-${loanId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loans", filter: `id=eq.${loanId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "loan_status_history", filter: `loan_id=eq.${loanId}` },
        () => void loadHistory(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loanId]);

  async function load() {
    setLoading(true);
    const [{ data: l }, { data: d }] = await Promise.all([
      supabase.from("loans").select("*").eq("id", loanId).maybeSingle(),
      supabase.from("loan_documents").select("id, file_name, file_path, file_size, created_at").eq("loan_id", loanId).order("created_at"),
    ]);
    setLoan(l as Loan | null);
    setDocs((d as DocRow[]) ?? []);
    await loadHistory();
    setLoading(false);
  }

  async function loadHistory() {
    const { data } = await supabase
      .from("loan_status_history")
      .select("id, old_status, new_status, note, created_at")
      .eq("loan_id", loanId)
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as Array<{
      id: string; old_status: LoanStatus | null; new_status: LoanStatus; note: string | null; created_at: string;
    }>;
    setHistory(
      rows.map((r) => ({
        id: r.id,
        old_status: r.old_status,
        new_status: r.new_status,
        message:
          r.note?.trim() ||
          t(`loanDetail.loanDescription.${r.new_status}`, {
            defaultValue: LOAN_STATUS_META[r.new_status]?.description ?? r.new_status,
          }),
        created_at: r.created_at,
      })),
    );
  }

  async function downloadFile(bucket: string, path: string, name: string) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data) {
      toast.error(t("loanDetail.downloadImpossible"));
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.click();
  }

  async function downloadContractPdf() {
    if (!loan || !user) return;
    const id = toast.loading(t("loanDetail.contractGenerating"));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error(t("loanDetail.sessionExpired"));
      const { base64, filename } = await generateContractPdf({ data: { loanId: loan.id, accessToken, locale: i18n.language } });
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("loanDetail.contractDownloaded"), { id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("loanDetail.unknownError");
      toast.error(t("loanDetail.generationImpossible", { message: msg }), { id });
    }
  }

  async function handleSignedUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !loan) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("loanDetail.fileTooHeavy"));
      return;
    }
    setUploading(true);
    const safe = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const path = `${user.id}/${loan.id}/signed-${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from("contracts").upload(path, file);
    if (upErr) {
      setUploading(false);
      toast.error(t("loanDetail.uploadFailed"));
      return;
    }
    const { error: updateErr } = await supabase
      .from("loans")
      .update({ signed_contract_path: path, status: "contrat_signe", })
      .eq("id", loan.id);
    setUploading(false);
    if (updateErr) {
      toast.error(t("loanDetail.updateError"));
    } else {
      toast.success(t("loanDetail.signedSent"));
      const { notifyAllAdmins } = await import("@/lib/notifications");
      await notifyAllAdmins({
        titleKey: "notif.loan.signedReceivedTitle",
        messageKey: "notif.loan.signedReceivedMsg",
        params: { name: loan.full_name ?? "—", id: loan.id.slice(0, 8) },
        link: "/admin",
        category: "success",
      });
      setTimeout(async () => {
        await supabase.from("loans").update({ status: "en_traitement", }).eq("id", loan.id);
        void load();
      }, 3000);
      void load();
    }
    e.target.value = "";
  }

  if (loading || authLoading)
    return <div className="flex items-center justify-center h-96 text-muted-foreground">{t("loanDetail.loading")}</div>;
  if (!loan)
    return <div className="text-center py-20 text-muted-foreground">{t("loanDetail.notFound")}</div>;

  const status = loan.status;
  const isRefused = status === "refuse";
  const meta = LOAN_STATUS_META[status];
  const tone = TONE_CLASSES[meta.tone];
  const statusLabel = t(`status.${status}`, { defaultValue: meta.label });
  const statusDescription = t(`loanDetail.loanDescription.${status}`, { defaultValue: meta.description });
  const monthlyPayment = Number(loan.amount) / Number(loan.duration_months);
  const remainingBalance = Number(loan.amount) - Number(loan.disbursed_amount ?? 0);

  const timeline: TimelineEvent[] = history.length > 0
    ? history
    : [{
        id: "t-created",
        message: t("loanDetail.requestSubmitted"),
        created_at: loan.created_at,
        old_status: null,
        new_status: loan.status,
      }];

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6 pb-28 lg:pb-10">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> {t("loanDetail.back")}
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{t("loanDetail.fileNumber", { id: loan.id.slice(0, 8).toUpperCase() })}</p>
          <h1 className="text-3xl font-serif tracking-tight mt-0.5">{t("loanDetail.title")}</h1>
        </div>
        {!isRefused && (
          <div className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full border font-medium text-sm shrink-0",
            tone.bg, tone.text, tone.border,
          )}>
            <meta.icon className={cn("h-4 w-4", status === "en_traitement" && "animate-spin")} />
            {statusLabel}
          </div>
        )}
      </div>

      {/* Stepper */}
      <Card className="overflow-hidden">
        <CardContent className="p-6 md:p-8">
          {isRefused ? (
            <div className="flex flex-col items-center justify-center text-center p-4">
              <div className="h-16 w-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold text-destructive mb-2">{t("loanDetail.refusedTitle")}</h3>
              <p className="text-muted-foreground max-w-md">
                {t("loanDetail.refusedDesc")}
              </p>
              {loan.admin_notes && (
                <div className="mt-6 p-4 bg-destructive/5 border border-destructive/20 rounded-xl text-sm text-destructive text-left w-full max-w-md">
                  <strong>{t("loanDetail.reason")} :</strong> {loan.admin_notes}
                </div>
              )}
            </div>
          ) : (
            <LoanStepper currentStatus={status} />
          )}
          {!isRefused && (
            <p className="text-center text-sm text-muted-foreground mt-6">{statusDescription}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6 min-w-0">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("loanDetail.summaryTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                <SummaryItem label={t("loanDetail.amount")} value={formatCurrency(Number(loan.amount))} highlight />
                <SummaryItem label={t("loanDetail.duration")} value={t("loanDetail.durationMonths", { count: loan.duration_months })} highlight />
                <SummaryItem label={t("loanDetail.monthlyPayment")} value={formatCurrency(monthlyPayment)} />
                <SummaryItem label={t("loanDetail.monthlyIncome")} value={formatCurrency(Number(loan.monthly_income))} />
                {loan.purpose && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{t("loanDetail.purpose")}</dt>
                    <dd className="text-sm mt-1">{loan.purpose}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {docs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("loanDetail.documentsTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {docs.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-3 p-3 border rounded-xl hover-elevate">
                      <div className="h-9 w-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.file_name}</p>
                        <p className="text-xs text-muted-foreground">{t("loanDetail.addedOn", { date: formatDate(doc.created_at) })}</p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => downloadFile("loan-documents", doc.file_path, doc.file_name)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <TransferDialog
            open={!!withdrawLoanId}
            onClose={() => setWithdrawLoanId(null)}
            initialLoanId={withdrawLoanId}
            loans={[
              {
                id: loan.id,
                amount: Number(loan.amount),
                disbursed_amount: Number(loan.disbursed_amount ?? 0),
                status: loan.status,
              },
            ]}
            defaultBeneficiary={loan.full_name}
            onSuccess={() => void load()}
          />
        </div>

        {/* Side column */}
        <div className="space-y-6 min-w-0">
          {status === "fonds_disponibles" && (
            <Card className="border-0 shadow-elevated overflow-hidden bg-gradient-to-br from-success to-emerald-700 text-white relative">
              <div aria-hidden className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <CardContent className="p-6 relative">
                <div className="flex items-center gap-2 text-white/80 text-xs font-medium uppercase tracking-wider">
                  <Wallet className="h-4 w-4" /> {t("loanDetail.availableBalance")}
                </div>
                <div className="text-2xl sm:text-3xl md:text-4xl font-serif font-medium mt-1.5 tabular-nums break-all">
                  {formatCurrency(remainingBalance)}
                </div>
                {Number(loan.disbursed_amount ?? 0) > 0 && (
                  <p className="text-xs text-white/70 mt-1">
                    {t("loanDetail.alreadyWithdrawn", {
                      withdrawn: formatCurrency(Number(loan.disbursed_amount)),
                      total: formatCurrency(Number(loan.amount)),
                    })}
                  </p>
                )}
                <Button
                  className="w-full mt-5 bg-white text-success hover:bg-white/95 font-semibold shadow-md"
                  size="lg"
                  onClick={() => setWithdrawLoanId(loan.id)}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {t("loanDetail.makeTransfer")}
                </Button>
              </CardContent>
            </Card>
          )}

          {(status === "contrat_envoye" || status === "contrat_signe" || status === "en_traitement" || status === "fonds_disponibles") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-accent" /> {t("loanDetail.contractTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {status === "contrat_envoye" && (
                  <Button variant="outline" className="w-full justify-between" onClick={downloadContractPdf}>
                    {t("loanDetail.downloadContract")}
                    <Download className="h-4 w-4" />
                  </Button>
                )}

                {status === "contrat_envoye" && (
                  <div className="pt-4 border-t space-y-3">
                    <p className="text-sm">{t("loanDetail.signInstruction")}</p>
                    <input type="file" id="signedContract" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleSignedUpload} disabled={uploading} />
                    <Button asChild className="w-full shadow-glow" disabled={uploading}>
                      <label htmlFor="signedContract" className="cursor-pointer">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                        {t("loanDetail.sendSignedContract")}
                      </label>
                    </Button>
                  </div>
                )}

                {loan.signed_contract_path && (
                  <div className="flex items-center gap-2 text-sm text-success bg-success/5 p-3 rounded-lg border border-success/20">
                    <CheckCircle2 className="h-4 w-4" /> {t("loanDetail.signedContractReceived")}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" /> {t("loanDetail.historyTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t("loanDetail.noAction")}</p>
              ) : (
                <ol className="relative space-y-5 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-border">
                  {timeline.map((event) => (
                    <li key={event.id} className="relative pl-9">
                      <span className="absolute left-0 top-1 h-6 w-6 rounded-full bg-accent/10 border-2 border-background ring-2 ring-accent/30 flex items-center justify-center">
                        <Check className="h-3 w-3 text-accent" />
                      </span>
                      <p className="text-sm font-medium break-words">{event.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 break-all">{formatDateTime(event.created_at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</dt>
      <dd className={cn("mt-1 tabular-nums break-words overflow-hidden", highlight ? "text-xl sm:text-2xl font-serif font-medium" : "text-base font-medium")}>
        {value}
      </dd>
    </div>
  );
}
