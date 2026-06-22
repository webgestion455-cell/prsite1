import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate, formatDateTime, type LoanStatus } from "@/lib/loan-helpers";
import {
  ArrowLeft, Mail, Phone, Calendar, ShieldOff, ShieldCheck, AlertCircle,
  Wallet, ArrowRightLeft, Eye, Send,
} from "lucide-react";
import { toast } from "sonner";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

const ADMIN_EMAIL = "hsbcadmin5@gmail.com";

export const Route = createFileRoute("/admin/clients/$userId")({
  component: AdminClientDetail,
  head: () => ({ meta: [{ title: "Fiche client — Admin" }] }),
});

interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  blocked: boolean;
  blocked_at: string | null;
  blocked_reason: string | null;
}

interface Loan {
  id: string;
  amount: number;
  duration_months: number;
  status: LoanStatus;
  created_at: string;
  disbursed_amount: number;
}

interface Withdrawal {
  id: string;
  amount: number;
  status: string;
  beneficiary: string;
  iban: string;
  bank_name: string;
  reference: string | null;
  created_at: string;
  transfer_kind?: string | null;
}

function AdminClientDetail() {
  const { t } = useTranslation();
  const { userId } = Route.useParams();
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBlock, setShowBlock] = useState(false);
  const [blockReason, setBlockReason] = useState("");
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
  }, [role, userId]);

  async function load() {
    setLoading(true);
    const [pRes, lRes, wRes] = await Promise.all([
      (supabase.from("profiles") as any)
        .select("user_id, full_name, email, phone, created_at, blocked, blocked_at, blocked_reason")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("loans")
        .select("id, amount, duration_months, status, created_at, disbursed_amount")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      (supabase.from("withdrawals") as any)
        .select("id, amount, status, beneficiary, iban, bank_name, reference, created_at, transfer_kind")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);
    if (pRes.data) {
      const row = pRes.data as Profile & { blocked?: boolean | null };
      setProfile({
        ...row,
        blocked: Boolean(row.blocked),
      });
    }
    setLoans((lRes.data as Loan[]) ?? []);
    setWithdrawals((wRes.data as Withdrawal[]) ?? []);
    setLoading(false);
  }

  async function toggleBlock(block: boolean) {
    if (!profile) return;
    if (block && !blockReason.trim()) {
      toast.error("Indiquez un motif");
      return;
    }
    setBusy(true);
    const update = block
      ? { blocked: true, blocked_at: new Date().toISOString(), blocked_reason: blockReason.trim() }
      : { blocked: false, blocked_at: null, blocked_reason: null };
    const { error } = await (supabase.from("profiles") as any)
      .update(update)
      .eq("user_id", profile.user_id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(block ? "Compte bloqué" : "Compte débloqué");
    setShowBlock(false);
    setBlockReason("");
    void load();
  }

  if (authLoading || role !== "admin") {
    return <div className="flex items-center justify-center h-96 text-muted-foreground">{t("common.loading")}</div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96 text-muted-foreground">{t("common.loading")}</div>;
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/admin/clients"><ArrowLeft className="h-4 w-4 mr-1" /> {t("common.back")}</Link>
        </Button>
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><AlertCircle className="h-6 w-6" /></EmptyMedia>
            <EmptyTitle>Client introuvable</EmptyTitle>
            <EmptyDescription>Ce profil n'existe pas ou n'est plus accessible.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const totalBorrowed = loans.reduce((s, l) => s + Number(l.amount), 0);
  const totalDisbursed = loans.reduce((s, l) => s + Number(l.disbursed_amount ?? 0), 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl pb-28 lg:pb-10">
      <div className="flex items-center gap-3 mb-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/clients"><ArrowLeft className="h-4 w-4 mr-1" /> {t("common.back")}</Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground text-xl font-semibold">
            {(profile.full_name ?? "?").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-3xl font-serif text-primary">{profile.full_name || "Client sans nom"}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{profile.email}</span>
              {profile.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{profile.phone}</span>}
              <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(profile.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {profile.blocked ? (
            <Button onClick={() => toggleBlock(false)} disabled={busy} variant="outline">
              <ShieldCheck className="h-4 w-4 mr-1.5 text-success" />
              {t("admin.clientDetail.unblockBtn")}
            </Button>
          ) : (
            <Button onClick={() => setShowBlock(true)} variant="destructive">
              <ShieldOff className="h-4 w-4 mr-1.5" />
              {t("admin.clientDetail.blockBtn")}
            </Button>
          )}
        </div>
      </div>

      {profile.blocked && (
        <Card className="mb-6 border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldOff className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-destructive">{t("admin.clientsPage.blocked")}</p>
              {profile.blocked_at && (
                <p className="text-muted-foreground">
                  {t("admin.clientDetail.blockedSince")} : {formatDate(profile.blocked_at)}
                </p>
              )}
              {profile.blocked_reason && (
                <p className="text-foreground mt-1">
                  {t("admin.clientDetail.blockedReason")} : {profile.blocked_reason}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs récap */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Prêts</p>
            <p className="text-2xl font-bold tabular-nums">{loans.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total emprunté</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalBorrowed)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Décaissé</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalDisbursed)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Virements</p>
            <p className="text-2xl font-bold tabular-nums">{withdrawals.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Loans */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" /> {t("admin.clientDetail.loans")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loans.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">{t("admin.clientDetail.noLoans")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Durée</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(Number(l.amount))}</TableCell>
                      <TableCell className="text-muted-foreground">{l.duration_months} mois</TableCell>
                      <TableCell><StatusBadge status={l.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(l.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link to="/loans/$loanId" params={{ loanId: l.id }}>
                            <Eye className="h-4 w-4 mr-1" /> {t("common.open")}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Withdrawals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" /> {t("admin.clientDetail.withdrawals")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {withdrawals.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">{t("admin.clientDetail.noWithdrawals")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Bénéficiaire</TableHead>
                    <TableHead>IBAN</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawals.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(Number(w.amount))}</TableCell>
                      <TableCell>{w.beneficiary}</TableCell>
                      <TableCell className="font-mono text-xs">{w.iban.slice(0, 4)}…{w.iban.slice(-4)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {w.transfer_kind === "instantane" ? "Instantané" : "Classique"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={w.status === "envoye" ? "default" : w.status === "rejete" ? "destructive" : "secondary"}
                          className={w.status === "envoye" ? "bg-success text-success-foreground" : ""}
                        >
                          {w.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(w.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block modal */}
      {showBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => !busy && setShowBlock(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <ShieldOff className="h-5 w-5 text-destructive" />
              {t("admin.clientDetail.blockTitle")}
            </h3>
            <div className="mt-4">
              <Label htmlFor="reason">{t("admin.clientDetail.blockReason")}</Label>
              <Textarea
                id="reason"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder={t("admin.clientDetail.blockReasonPlaceholder")}
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowBlock(false)} disabled={busy}>{t("common.cancel")}</Button>
              <Button variant="destructive" onClick={() => toggleBlock(true)} disabled={busy || !blockReason.trim()}>
                {t("admin.clientDetail.confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
