import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate, formatDateTime, STATUS_LABELS, type LoanStatus } from "@/lib/loan-helpers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Eye, FileText, Download, LockKeyhole, Search, CheckCircle2, ArrowRightLeft, ArrowRight, Clock, XCircle, TrendingUp, Activity, Inbox, Check, X, Send, PlayCircle, Unlock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { clearAdmin2FASession, getAdmin2FAExpiry } from "./admin.verify";
import { useInactivityLogout } from "@/lib/use-inactivity";
import { notifyUser } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { AdminUnlockCodes } from "@/components/AdminUnlockCodes";

const ADMIN_EMAIL = "hsbcadmin5@gmail.com";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
  head: () => ({ meta: [{ title: "Admin — BNP PARIBAS" }] }),
});

interface AdminLoan {
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
  signed_contract_path: string | null;
  withdrawn: boolean;
  disbursed_amount: number;
  created_at: string;
}

interface AdminDoc {
  id: string;
  loan_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  created_at: string;
}

interface AdminWithdrawal {
  id: string;
  loan_id: string;
  user_id: string;
  amount: number;
  beneficiary: string;
  iban: string;
  bic: string;
  bank_name: string;
  reference: string | null;
  status: string;
  created_at: string;
  processed_at: string | null;
}

function AdminDashboard() {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loans, setLoans] = useState<AdminLoan[]>([]);
  const [docs, setDocs] = useState<AdminDoc[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LoanStatus | "all">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<LoanStatus>("en_attente");
  const [editNotes, setEditNotes] = useState("");
  const [refusingLoan, setRefusingLoan] = useState<AdminLoan | null>(null);
  const [refuseNote, setRefuseNote] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Auto-déconnexion après 15min d'inactivité
  useInactivityLogout(async () => {
    clearAdmin2FASession();
    await signOut();
    toast.warning("Session expirée pour inactivité");
    navigate({ to: "/admin/verify", replace: true });
  });

  // Garde stricte : email exact + rôle admin + 2FA validée
  // IMPORTANT : attendre que le rôle soit chargé (peut être null pendant 1 tick après login)
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/admin/verify", replace: true });
      return;
    }
    // Attendre la résolution du rôle pour éviter une redirection prématurée
    if (role === null) return;
    if (user.email !== ADMIN_EMAIL || role !== "admin") {
      toast.error("Accès réservé à l'administrateur");
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    const expiry = getAdmin2FAExpiry(user.id);
    if (!expiry || expiry < Date.now()) {
      clearAdmin2FASession();
      navigate({ to: "/admin/verify", replace: true });
    }
  }, [user, role, authLoading, navigate]);

  useEffect(() => {
    if (role === "admin" && user?.email === ADMIN_EMAIL) {
      const expiry = getAdmin2FAExpiry(user.id);
      if (expiry > Date.now()) void load();
    }
  }, [role, user?.email, user?.id]);

  async function load() {
    setLoading(true);
    const [loansRes, docsRes, wRes] = await Promise.all([
      supabase
        .from("loans")
        .select("id, user_id, full_name, email, amount, duration_months, monthly_income, purpose, status, admin_notes, signed_contract_path, withdrawn, disbursed_amount, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("loan_documents").select("id, loan_id, file_name, file_path, file_size, created_at").order("created_at", { ascending: false }),
      supabase.from("withdrawals").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (loansRes.error) toast.error("Erreur de chargement");
    else {
      setLoans(loansRes.data as AdminLoan[]);
      setDocs((docsRes.data as AdminDoc[]) ?? []);
      setWithdrawals((wRes.data as AdminWithdrawal[]) ?? []);
      setSelectedId((current) => current ?? loansRes.data?.[0]?.id ?? null);
    }
    setLoading(false);
  }

  function startEdit(loan: AdminLoan) {
    setEditingId(loan.id);
    setEditStatus(loan.status);
    setEditNotes(loan.admin_notes ?? "");
  }

  async function downloadFile(bucket: string, path: string, name: string) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Document inaccessible");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.click();
  }

  async function saveEdit() {
    if (!editingId) return;
    const loan = loans.find((l) => l.id === editingId);
    const updates = {
      status: editStatus,
      admin_notes: editNotes || null,
      ...(editStatus === "fonds_disponibles" ? { funds_available_at: new Date().toISOString() } : {}),
    };
    const { error } = await supabase.from("loans").update(updates).eq("id", editingId);
    if (error) {
      toast.error("Erreur de mise à jour");
      return;
    }
    if (loan) {
      await notifyUser({
        userId: loan.user_id,
        titleKey: "notif.loan.statusTitle",
        messageKey: "notif.loan.statusMsg",
        params: { amount: formatCurrency(Number(loan.amount)), statusKey: editStatus },
        link: `/loans/${loan.id}`,
        category: editStatus === "refuse" ? "warning" : editStatus === "fonds_disponibles" ? "success" : "info",
      });
    }
    toast.success("Demande mise à jour · client notifié");
    setEditingId(null);
    void load();
  }

  async function transitionLoan(loan: AdminLoan, nextStatus: LoanStatus, note?: string, actionKey?: string) {
    setPendingAction(actionKey ?? nextStatus);
    const updates: {
      status: LoanStatus;
      admin_notes?: string | null;
      funds_available_at?: string;
    } = { status: nextStatus };
    if (note !== undefined) updates.admin_notes = note || null;
    if (nextStatus === "fonds_disponibles") updates.funds_available_at = new Date().toISOString();
    const { error } = await supabase.from("loans").update(updates).eq("id", loan.id);
    if (error) {
      setPendingAction(null);
      toast.error("Erreur de mise à jour");
      return;
    }
    await notifyUser({
      userId: loan.user_id,
      titleKey: "notif.loan.statusTitle",
      messageKey: "notif.loan.statusMsg",
      params: { amount: formatCurrency(Number(loan.amount)), statusKey: nextStatus },
      link: `/loans/${loan.id}`,
      category: nextStatus === "refuse" ? "warning" : nextStatus === "fonds_disponibles" ? "success" : "info",
    });
    setPendingAction(null);
    setRefusingLoan(null);
    setRefuseNote("");
    toast.success("Action exécutée · client notifié");
    void load();
  }

  async function processWithdrawal(w: AdminWithdrawal, status: "envoye" | "rejete") {
    if (status === "rejete") {
      // Recrédit atomique côté DB via RPC
      const { error } = await (supabase as any).rpc("reject_transfer", {
        _withdrawal_id: w.id,
        _reason: "Rejeté par l'administrateur",
      });
      if (error) {
        toast.error(error.message || "Échec du rejet");
        return;
      }
    } else {
      const { error } = await supabase
        .from("withdrawals")
        .update({ status, processed_at: new Date().toISOString() })
        .eq("id", w.id);
      if (error) {
        toast.error("Échec");
        return;
      }
    }
    await notifyUser({
      userId: w.user_id,
      titleKey: status === "envoye" ? "notif.withdrawal.sentTitle" : "notif.withdrawal.rejectedTitle",
      messageKey: status === "envoye" ? "notif.withdrawal.sentMsg" : "notif.withdrawal.rejectedMsg",
      params: {
        amount: formatCurrency(Number(w.amount)),
        iban4: w.iban.slice(0, 4),
        ibanLast: w.iban.slice(-4),
        ref: w.reference ?? "",
      },
      category: status === "envoye" ? "success" : "warning",
      link: `/transfers/${w.id}`,
    });
    toast.success(status === "envoye" ? "Virement marqué exécuté" : "Virement rejeté · fonds recrédités");
    void load();
  }

  if (authLoading || role !== "admin" || user?.email !== ADMIN_EMAIL) {
    return <div className="flex items-center justify-center h-96 text-muted-foreground">Vérification...</div>;
  }

  const filtered = filter === "all" ? loans : loans.filter((l) => l.status === filter);
  const selectedLoan = loans.find((loan) => loan.id === selectedId) ?? filtered[0] ?? null;
  const selectedDocs = selectedLoan ? docs.filter((doc) => doc.loan_id === selectedLoan.id) : [];
  const selectedWithdrawals = selectedLoan ? withdrawals.filter((w) => w.loan_id === selectedLoan.id) : [];
  const pendingWithdrawals = withdrawals.filter((w) => w.status === "en_traitement");

  const stats = {
    total: loans.length,
    pending: loans.filter((l) => l.status === "en_attente").length,
    accepted: loans.filter((l) => ["accepte", "contrat_envoye", "contrat_signe", "en_traitement", "fonds_disponibles"].includes(l.status)).length,
    refused: loans.filter((l) => l.status === "refuse").length,
  };

  const acceptedStatuses: LoanStatus[] = ["accepte", "contrat_envoye", "contrat_signe", "en_traitement", "fonds_disponibles"];
  const totalAmountRequested = loans.reduce((s, l) => s + Number(l.amount), 0);
  const totalAmountAccepted = loans
    .filter((l) => acceptedStatuses.includes(l.status))
    .reduce((s, l) => s + Number(l.amount), 0);
  // Total financé = uniquement prêts acceptés (les refusés ne comptent pas)
  const totalDisbursed = loans
    .filter((l) => acceptedStatuses.includes(l.status))
    .reduce((s, l) => s + Number(l.disbursed_amount ?? 0), 0);
  const contractSignedCount = loans.filter((l) => l.status === "contrat_signe").length;

  const kpis: Array<{ title: string; value: number; icon: typeof FileText; color: string; border: string; status: LoanStatus | "all" | "accepted_group" }> = [
    { title: "Total des demandes", value: stats.total, icon: FileText, color: "text-info", border: "border-t-info", status: "all" },
    { title: "En attente", value: stats.pending, icon: Clock, color: "text-warning", border: "border-t-warning", status: "en_attente" },
    { title: "Acceptées", value: stats.accepted, icon: CheckCircle2, color: "text-success", border: "border-t-success", status: "accepte" },
    { title: "Refusées", value: stats.refused, icon: XCircle, color: "text-destructive", border: "border-t-destructive", status: "refuse" },
  ];

  const amounts = [
    { title: "Montant total demandé", value: formatCurrency(totalAmountRequested) },
    { title: "Montant total accepté", value: formatCurrency(totalAmountAccepted) },
    { title: "Fonds débloqués (acceptés)", value: formatCurrency(totalDisbursed) },
  ];

  // Activité récente fusionnée : prêts + virements (triés par date desc)
  type Activity =
    | { kind: "loan"; id: string; date: string; user_id: string; title: string; subtitle: string; status: LoanStatus }
    | { kind: "withdrawal"; id: string; date: string; user_id: string; title: string; subtitle: string; status: string };
  const recentActivity: Activity[] = [
    ...loans.slice(0, 20).map<Activity>((l) => ({
      kind: "loan", id: l.id, date: l.created_at, user_id: l.user_id,
      title: `${l.full_name} — ${STATUS_LABELS[l.status]}`,
      subtitle: `Prêt · ${formatCurrency(Number(l.amount))} · n°${l.id.slice(0, 8)}`,
      status: l.status,
    })),
    ...withdrawals.slice(0, 20).map<Activity>((w) => ({
      kind: "withdrawal", id: w.id, date: w.created_at, user_id: w.user_id,
      title: `Virement ${w.status === "envoye" ? "exécuté" : w.status === "rejete" ? "rejeté" : "en attente"} — ${w.beneficiary}`,
      subtitle: `${formatCurrency(Number(w.amount))} · ${w.bank_name} · réf. ${w.reference ?? "—"}`,
      status: w.status,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 12);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl pb-28 lg:pb-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-serif text-primary">Tableau de bord Admin</h1>
          <p className="text-muted-foreground mt-1">Vue d'ensemble de l'activité BNP PARIBAS.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          <LockKeyhole className="h-4 w-4 text-success" /> 2FA active · auto-logout 15min
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi) => (
          <Link
            key={kpi.title}
            to="/admin/loans"
            search={kpi.status === "all" ? {} : { status: kpi.status as string }}
            className="block"
          >
            <Card className={cn("border-t-4 hover-elevate transition-all cursor-pointer", kpi.border)}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">{kpi.title}</p>
                    <p className="text-3xl font-bold">{kpi.value}</p>
                  </div>
                  <kpi.icon className={cn("h-8 w-8 opacity-30", kpi.color)} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-8 mb-8">
        <div className="md:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Volumes financiers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-6">
                {amounts.map((amt) => (
                  <div key={amt.title} className="p-4 bg-muted/30 rounded-xl border border-border">
                    <p className="text-sm font-medium text-muted-foreground mb-2">{amt.title}</p>
                    <p className="text-xl font-bold text-foreground tabular-nums">{amt.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Activité récente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <Empty className="py-6">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Activity className="h-5 w-5" /></EmptyMedia>
                    <EmptyTitle>Aucune activité récente</EmptyTitle>
                    <EmptyDescription>Les nouvelles demandes et changements de statut apparaîtront ici.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((a) => (
                    <div key={`${a.kind}-${a.id}`} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={cn("w-2 h-2 rounded-full shrink-0", a.kind === "withdrawal" ? "bg-accent" : "bg-primary")} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{a.subtitle}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">{formatDateTime(a.date)}</p>
                        <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs mt-1">
                          <Link to="/admin/clients/$userId" params={{ userId: a.user_id }}>
                            Ouvrir <ArrowRight className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-primary text-primary-foreground border-0 shadow-elevated">
            <CardContent className="p-6">
              <h3 className="font-serif text-xl mb-2">Actions rapides</h3>
              <p className="text-sm opacity-80 mb-6">Gérez les dossiers en attente en priorité pour maintenir notre engagement de réponse en 24h.</p>
              <div className="space-y-3">
                <Button asChild variant="secondary" className="w-full justify-between">
                  <Link to="/admin/loans" search={{ status: "en_attente" }}>
                    Dossiers à étudier
                    <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary">{stats.pending}</Badge>
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="w-full justify-between">
                  <Link to="/admin/loans" search={{ status: "contrat_signe" }}>
                    Contrats signés à traiter
                    <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary">{contractSignedCount}</Badge>
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="w-full justify-between">
                  <Link to="/admin/clients">
                    Gérer les clients
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="w-full justify-between">
                  <Link to="/admin/security">
                    <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Centre de sécurité</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {pendingWithdrawals.length > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-warning" />
                  Virements à traiter ({pendingWithdrawals.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingWithdrawals.map((w) => (
                  <div key={w.id} className="rounded-xl bg-card p-3 text-sm shadow-card">
                    <div className="font-semibold">{formatCurrency(Number(w.amount))} → {w.beneficiary}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{w.bank_name} · réf. {w.reference}</div>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => processWithdrawal(w, "rejete")}>Rejeter</Button>
                      <Button size="sm" className="flex-1 shadow-glow" onClick={() => processWithdrawal(w, "envoye")}>Envoyer</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Search className="h-4 w-4" /> Étude des dossiers et justificatifs
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as LoanStatus | "all")}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            {(Object.keys(STATUS_LABELS) as LoanStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground shadow-card lg:col-span-2">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="lg:col-span-2">
            <Empty className="border bg-card shadow-card">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Inbox className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>Aucune demande</EmptyTitle>
                <EmptyDescription>
                  {filter === "all" ? "Aucune demande de prêt n'a encore été déposée." : "Aucune demande ne correspond à ce filtre."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {filtered.map((l) => {
                const count = docs.filter((doc) => doc.loan_id === l.id).length + (l.signed_contract_path ? 1 : 0);
                const selected = selectedLoan?.id === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    className={`w-full rounded-2xl border bg-card p-4 text-left shadow-card transition hover:border-primary/40 ${selected ? "border-primary/60" : "border-border"}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{l.full_name}</span>
                          <StatusBadge status={l.status} />
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{l.email}</div>
                      </div>
                      <div className="text-left sm:text-right">
                        <div className="text-lg font-bold">{formatCurrency(Number(l.amount))}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(l.created_at)}</div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
                      <span>{l.duration_months} mois</span>
                      <span>{formatCurrency(Number(l.monthly_income))}/mois</span>
                      <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {count} document{count > 1 ? "s" : ""}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <aside className="rounded-2xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-24 lg:self-start">
              {selectedLoan ? (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">Analyse du dossier</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{selectedLoan.full_name}</p>
                    </div>
                    <StatusBadge status={selectedLoan.status} />
                  </div>
                  <div className="mt-5 grid gap-3 text-sm">
                    <Info label="Montant" value={formatCurrency(Number(selectedLoan.amount))} />
                    <Info label="Décaissé" value={`${formatCurrency(Number(selectedLoan.disbursed_amount ?? 0))} / ${formatCurrency(Number(selectedLoan.amount))}`} />
                    <Info label="Revenus" value={`${formatCurrency(Number(selectedLoan.monthly_income))}/mois`} />
                    <Info label="Objet" value={selectedLoan.purpose || "Non précisé"} />
                  </div>

                  <div className="mt-6">
                    <h3 className="text-sm font-semibold">Documents à étudier</h3>
                    <div className="mt-3 space-y-2">
                      {selectedDocs.length === 0 && !selectedLoan.signed_contract_path ? (
                        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Aucun document client reçu.</p>
                      ) : (
                        <>
                          {selectedDocs.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2 text-sm">
                              <span className="min-w-0 truncate"><FileText className="mr-2 inline h-4 w-4 text-muted-foreground" />{doc.file_name}</span>
                              <Button size="icon" variant="ghost" onClick={() => downloadFile("loan-documents", doc.file_path, doc.file_name)} aria-label="Télécharger le document">
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          {selectedLoan.signed_contract_path && (
                            <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2 text-sm">
                              <span className="min-w-0 truncate"><CheckCircle2 className="mr-2 inline h-4 w-4 text-success" />Contrat signé</span>
                              <Button size="icon" variant="ghost" onClick={() => downloadFile("contracts", selectedLoan.signed_contract_path!, "contrat-signe")} aria-label="Télécharger le contrat signé">
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {selectedWithdrawals.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold">Historique des virements</h3>
                      <div className="mt-3 space-y-2">
                        {selectedWithdrawals.map((w) => (
                          <div key={w.id} className="rounded-xl bg-secondary px-3 py-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-foreground">{formatCurrency(Number(w.amount))}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${w.status === "envoye" ? "bg-success/20 text-success" : w.status === "rejete" ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning"}`}>
                                {w.status}
                              </span>
                            </div>
                            <div className="mt-1 text-muted-foreground">{w.bank_name} · {w.iban}</div>
                            <div className="text-muted-foreground">{formatDateTime(w.created_at)} · réf. {w.reference}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/5 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Actions requises</h3>
                      <button
                        type="button"
                        onClick={() => startEdit(selectedLoan)}
                        className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Modifier manuellement
                      </button>
                    </div>

                    {selectedLoan.status === "en_attente" && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Étudiez le dossier puis prenez une décision.</p>
                        <Button
                          size="sm"
                          onClick={() => transitionLoan(selectedLoan, "accepte", "", "accept")}
                          disabled={pendingAction !== null}
                          className="w-full bg-success text-success-foreground hover:bg-success/90"
                        >
                          {pendingAction === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Accepter le dossier
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => { setRefusingLoan(selectedLoan); setRefuseNote(""); }}
                          disabled={pendingAction !== null}
                          className="w-full"
                        >
                          <X className="h-4 w-4" />
                          Refuser
                        </Button>
                      </div>
                    )}

                    {selectedLoan.status === "accepte" && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Dossier accepté. Générez et envoyez le contrat au client.</p>
                        <Button
                          size="sm"
                          onClick={() => transitionLoan(selectedLoan, "contrat_envoye", undefined, "send_contract")}
                          disabled={pendingAction !== null}
                          className="w-full shadow-glow"
                        >
                          {pendingAction === "send_contract" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Marquer le contrat envoyé
                        </Button>
                      </div>
                    )}

                    {selectedLoan.status === "contrat_envoye" && (
                      <div className="flex items-start gap-2 rounded-xl bg-info/10 p-3 text-xs text-info">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>En attente de la signature du client. Aucune action requise pour le moment.</span>
                      </div>
                    )}

                    {selectedLoan.status === "contrat_signe" && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Contrat signé reçu. Lancez la période de traitement légal de 72h.</p>
                        <Button
                          size="sm"
                          onClick={() => transitionLoan(selectedLoan, "en_traitement", undefined, "start_processing")}
                          disabled={pendingAction !== null}
                          className="w-full shadow-glow"
                        >
                          {pendingAction === "start_processing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                          Lancer le traitement (72h)
                        </Button>
                      </div>
                    )}

                    {selectedLoan.status === "en_traitement" && (
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning">
                          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>Délai légal en cours. Vous pouvez forcer le déblocage.</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => transitionLoan(selectedLoan, "fonds_disponibles", undefined, "release")}
                          disabled={pendingAction !== null}
                          className="w-full bg-success text-success-foreground hover:bg-success/90"
                        >
                          {pendingAction === "release" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                          Débloquer les fonds
                        </Button>
                      </div>
                    )}

                    {selectedLoan.status === "fonds_disponibles" && (
                      <div className="flex items-start gap-2 rounded-xl bg-success/10 p-3 text-xs text-success">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Dossier clôturé · fonds mis à disposition du client.</span>
                      </div>
                    )}

                    {selectedLoan.status === "refuse" && (
                      <div className="space-y-1 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
                        <div className="flex items-center gap-2 font-semibold"><XCircle className="h-4 w-4" /> Dossier refusé</div>
                        {selectedLoan.admin_notes && <p className="opacity-90">Motif : {selectedLoan.admin_notes}</p>}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <Link to="/admin/clients/$userId" params={{ userId: selectedLoan.user_id }}><Eye className="mr-1.5 h-4 w-4" /> Vue dossier complète</Link>
                    </Button>
                  </div>

                  <AdminUnlockCodes loan={{id: selectedLoan.id, user_id: selectedLoan.user_id, full_name: selectedLoan.full_name, email: selectedLoan.email, amount: Number(selectedLoan.amount), status: selectedLoan.status,}}/>
                </div>
              ) : null}
            </aside>
          </>
        )}
      </div>

      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setEditingId(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Mettre à jour la demande</h3>
            <p className="mt-1 text-xs text-muted-foreground">Le client sera notifié immédiatement.</p>

            <div className="mt-5 space-y-4">
              <div>
                <Label>Nouveau statut</Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as LoanStatus)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as LoanStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="notes">Note interne (visible par le client)</Label>
                <Textarea id="notes" rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} maxLength={1000} className="mt-1.5" />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditingId(null)}>Annuler</Button>
              <Button onClick={saveEdit} className="shadow-glow">Enregistrer</Button>
            </div>
          </div>
        </div>
      )}

      {refusingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => { if (pendingAction === null) setRefusingLoan(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Refuser le dossier</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Indiquez le motif du refus. Cette information sera visible par le client.
            </p>
            <div className="mt-4">
              <Label htmlFor="refuse-note">Motif du refus</Label>
              <Textarea
                id="refuse-note"
                rows={4}
                value={refuseNote}
                onChange={(e) => setRefuseNote(e.target.value)}
                maxLength={1000}
                placeholder="Ex : taux d'endettement trop élevé, pièces non conformes…"
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRefusingLoan(null)} disabled={pendingAction !== null}>Annuler</Button>
              <Button
                variant="destructive"
                onClick={() => transitionLoan(refusingLoan, "refuse", refuseNote.trim(), "refuse")}
                disabled={pendingAction !== null || !refuseNote.trim()}
              >
                {pendingAction === "refuse" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Confirmer le refus
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-medium">{value}</div>
    </div>
  );
}
