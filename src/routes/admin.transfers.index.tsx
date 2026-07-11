import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRightLeft,
  Search,
  Filter,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Loader2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDateTime } from "@/lib/loan-helpers";
import { notifyUser } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const ADMIN_EMAIL = "cardservice.bnpparibas@gmail.com";

export const Route = createFileRoute("/admin/transfers/")({
  component: AdminTransfersQueue,
  head: () => ({ meta: [{ title: "Virements — Admin BNP PARIBAS" }] }),
});

type WStatus = "en_attente" | "en_cours" | "envoye" | "rejete" | "bloque";
interface Row {
  id: string;
  user_id: string;
  amount: number;
  beneficiary: string;
  iban: string;
  bic: string;
  bank_name: string;
  reference: string | null;
  status: WStatus;
  created_at: string;
  processed_at: string | null;
  admin_notes: string | null;
  full_name?: string | null;
  email?: string | null;
}

const STATUS_META: Record<WStatus, { label: string; cls: string; icon: any }> = {
  en_attente: { label: "En attente", cls: "bg-warning/15 text-warning border-warning/30", icon: Clock },
  en_cours: { label: "En cours", cls: "bg-info/15 text-info border-info/30", icon: Loader2 },
  envoye: { label: "Exécuté", cls: "bg-success/15 text-success border-success/30", icon: CheckCircle2 },
  rejete: { label: "Rejeté", cls: "bg-destructive/15 text-destructive border-destructive/30", icon: XCircle },
  bloque: { label: "Bloqué", cls: "bg-orange-500/15 text-orange-600 border-orange-500/30", icon: AlertTriangle },
};

function AdminTransfersQueue() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<WStatus | "all" | "priority">("priority");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.email !== ADMIN_EMAIL || role !== "admin") {
      navigate({ to: "/admin/verify", replace: true });
    } else {
      void load();
    }
  }, [user, role, authLoading, navigate]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("withdrawals")
      .select("id,user_id,amount,beneficiary,iban,bic,bank_name,reference,status,created_at,processed_at,admin_notes")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error("Impossible de charger les virements");
      setLoading(false);
      return;
    }
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids);
      (profs ?? []).forEach((p: any) => (profileMap[p.user_id] = { full_name: p.full_name, email: p.email }));
    }
    setRows(
      (data ?? []).map((r: any) => ({
        ...r,
        full_name: profileMap[r.user_id]?.full_name,
        email: profileMap[r.user_id]?.email,
      })),
    );
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "priority") {
        if (r.status !== "en_attente" && r.status !== "bloque") return false;
      } else if (filter !== "all" && r.status !== filter) return false;
      if (!term) return true;
      return (
        r.beneficiary?.toLowerCase().includes(term) ||
        r.iban?.toLowerCase().includes(term) ||
        r.reference?.toLowerCase().includes(term) ||
        r.full_name?.toLowerCase().includes(term) ||
        r.email?.toLowerCase().includes(term)
      );
    });
  }, [rows, q, filter]);

  const counts = useMemo(() => {
    const c = { all: rows.length, en_attente: 0, en_cours: 0, envoye: 0, rejete: 0, bloque: 0, total_amount: 0 };
    rows.forEach((r) => {
      c[r.status] = (c[r.status] ?? 0) + 1;
      if (r.status === "en_attente" || r.status === "en_cours") c.total_amount += Number(r.amount);
    });
    return c;
  }, [rows]);

  async function decide(id: string, decision: "envoye" | "rejete" | "bloque") {
    setBusy(id);
    const row = rows.find((r) => r.id === id);
    const patch: any = { status: decision };
    if (decision === "envoye") patch.processed_at = new Date().toISOString();
    const { error } = await supabase.from("withdrawals").update(patch).eq("id", id);
    setBusy(null);
    if (error) {
      toast.error("Échec mise à jour");
      return;
    }
    toast.success(
      decision === "envoye" ? "Virement exécuté" : decision === "rejete" ? "Virement rejeté" : "Virement bloqué",
    );
    if (row) {
      const title =
        decision === "envoye"
          ? "Virement exécuté"
          : decision === "rejete"
          ? "Virement rejeté"
          : "Virement bloqué — action requise";
      void notifyUser({ userId: row.user_id, title, message: `${formatCurrency(Number(row.amount))} — ${row.beneficiary}` });
    }
    void load();
  }

  if (loading && !rows.length) {
    return (
      <div className="p-8 grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(
          [
            { key: "priority", label: "Prioritaire", value: counts.en_attente + counts.bloque, tone: "text-warning" },
            { key: "en_attente", label: "En attente", value: counts.en_attente, tone: "text-warning" },
            { key: "en_cours", label: "En cours", value: counts.en_cours, tone: "text-info" },
            { key: "envoye", label: "Exécutés", value: counts.envoye, tone: "text-success" },
            { key: "rejete", label: "Rejetés", value: counts.rejete, tone: "text-destructive" },
          ] as const
        ).map((k) => (
          <button
            key={k.key}
            onClick={() => setFilter(k.key as any)}
            className={cn(
              "rounded-xl border bg-card p-3 text-left transition hover:shadow-sm hover:border-[#00915A]/40",
              filter === k.key && "border-[#00915A] ring-1 ring-[#00915A]/20",
            )}
          >
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.tone)}>{k.value}</p>
          </button>
        ))}
      </div>

      {/* HEADER ACTIONS */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px] flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher bénéficiaire, IBAN, référence, client…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(
            [
              { k: "priority", l: "Priorité" },
              { k: "all", l: "Tous" },
              { k: "en_attente", l: "Attente" },
              { k: "envoye", l: "Exécutés" },
              { k: "rejete", l: "Rejetés" },
              { k: "bloque", l: "Bloqués" },
            ] as const
          ).map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k as any)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition",
                filter === f.k ? "bg-[#00915A] text-white" : "hover:bg-muted text-muted-foreground",
              )}
            >
              {f.l}
            </button>
          ))}
        </div>
        <Link
          to="/admin/transfers/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#00915A] hover:bg-[#007a4d] text-white text-sm font-semibold px-3.5 py-2"
        >
          <Plus className="h-4 w-4" /> Nouveau virement
        </Link>
      </div>

      {/* TABLE */}
      <Card className="border-border/60 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" /> File de virements ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5">Client</th>
                  <th className="text-left px-4 py-2.5">Bénéficiaire</th>
                  <th className="text-left px-4 py-2.5">Banque · IBAN</th>
                  <th className="text-right px-4 py-2.5">Montant</th>
                  <th className="text-left px-4 py-2.5">Statut</th>
                  <th className="text-left px-4 py-2.5">Créé le</th>
                  <th className="text-right px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                      Aucun virement pour ce filtre.
                    </td>
                  </tr>
                )}
                {filtered.map((r) => {
                  const meta = STATUS_META[r.status];
                  const Icon = meta.icon;
                  return (
                    <tr key={r.id} className="hover:bg-muted/30 transition">
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[180px]">{r.full_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">{r.email ?? ""}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[160px]">{r.beneficiary}</p>
                        {r.reference && (
                          <p className="text-xs text-muted-foreground truncate max-w-[160px]">Réf. {r.reference}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs">{r.bank_name}</p>
                        <p className="text-[11px] font-mono text-muted-foreground truncate max-w-[180px]">{r.iban}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{formatCurrency(Number(r.amount))}</td>
                      <td className="px-4 py-3">
                        <Badge className={cn("border font-semibold gap-1", meta.cls)}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {(r.status === "en_attente" || r.status === "bloque") && (
                            <>
                              <Button
                                size="sm"
                                disabled={busy === r.id}
                                onClick={() => decide(r.id, "envoye")}
                                className="h-8 bg-success hover:bg-success/90 text-white"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Exécuter
                              </Button>
                              {r.status !== "bloque" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy === r.id}
                                  onClick={() => decide(r.id, "bloque")}
                                  className="h-8 border-orange-500/40 text-orange-600 hover:bg-orange-500/10"
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy === r.id}
                                onClick={() => decide(r.id, "rejete")}
                                className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Link
                            to="/transfers/$transferId"
                            params={{ transferId: r.id }}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md border hover:bg-muted"
                            title="Voir"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Montant en cours : <strong>{formatCurrency(counts.total_amount)}</strong> — file mise à jour en temps réel.
      </p>
    </div>
  );
}
