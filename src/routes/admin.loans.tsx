import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate, STATUS_LABELS, type LoanStatus } from "@/lib/loan-helpers";
import { ArrowLeft, FileText, Search, Eye, Inbox } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

const ADMIN_EMAIL = "cardservice.bnpparibas@gmail.com";

const searchSchema = z.object({
  status: z.string().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/admin/loans")({
  validateSearch: searchSchema,
  component: AdminLoansPage,
  head: () => ({ meta: [{ title: "Dossiers — Admin" }] }),
});

interface Row {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  amount: number;
  duration_months: number;
  status: LoanStatus;
  created_at: string;
}

function AdminLoansPage() {
  const { t } = useTranslation();
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [rows, setRows] = useState<Row[]>([]);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(search.status ?? "all");
  const [query, setQuery] = useState<string>(search.q ?? "");

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
    const [loansRes, docsRes] = await Promise.all([
      supabase
        .from("loans")
        .select("id, user_id, full_name, email, amount, duration_months, status, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("loan_documents").select("loan_id"),
    ]);
    setRows((loansRes.data as Row[]) ?? []);
    const counts: Record<string, number> = {};
    (docsRes.data ?? []).forEach((d: { loan_id: string }) => {
      counts[d.loan_id] = (counts[d.loan_id] ?? 0) + 1;
    });
    setDocCounts(counts);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter !== "all") r = r.filter((l) => l.status === statusFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter(
        (l) =>
          l.full_name.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.id.toLowerCase().includes(q),
      );
    }
    return r;
  }, [rows, statusFilter, query]);

  const totals = useMemo(() => {
    return {
      count: filtered.length,
      sum: filtered.reduce((s, r) => s + Number(r.amount), 0),
    };
  }, [filtered]);

  if (authLoading || role !== "admin") {
    return <div className="flex items-center justify-center h-96 text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl pb-28 lg:pb-10">
      <div className="flex items-center gap-3 mb-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> {t("common.back")}</Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-serif text-primary">{t("admin.loansPage.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("admin.loansPage.subtitle")}</p>
        </div>
        <div className="flex gap-3">
          <Card className="border-t-4 border-t-info">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("admin.kpis.total")}</p>
              <p className="text-2xl font-bold tabular-nums">{totals.count}</p>
            </CardContent>
          </Card>
          <Card className="border-t-4 border-t-primary">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("admin.amounts.requested")}</p>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(totals.sum)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`${t("common.search")}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {(Object.keys(STATUS_LABELS) as LoanStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">{t("common.loading")}</div>
          ) : filtered.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Inbox className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>Aucun dossier</EmptyTitle>
                <EmptyDescription>Aucun dossier ne correspond aux filtres.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.loansPage.client")}</TableHead>
                    <TableHead className="text-right">{t("admin.loansPage.amount")}</TableHead>
                    <TableHead>{t("admin.loansPage.duration")}</TableHead>
                    <TableHead>{t("admin.loansPage.status")}</TableHead>
                    <TableHead>{t("admin.loansPage.documents")}</TableHead>
                    <TableHead>{t("admin.loansPage.date")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="font-medium">{l.full_name}</div>
                        <div className="text-xs text-muted-foreground">{l.email}</div>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(Number(l.amount))}</TableCell>
                      <TableCell className="text-muted-foreground">{l.duration_months} mois</TableCell>
                      <TableCell><StatusBadge status={l.status} /></TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" /> {docCounts[l.id] ?? 0}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(l.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button asChild size="sm" variant="outline">
                            <Link to="/admin/clients/$userId" params={{ userId: l.user_id }}>
                              <Eye className="h-4 w-4 mr-1" /> {t("common.open")}
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
