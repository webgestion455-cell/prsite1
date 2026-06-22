import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/loan-helpers";
import { ArrowLeft, Search, Users, Eye, ShieldOff, ShieldCheck } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

const ADMIN_EMAIL = "hsbcadmin5@gmail.com";

export const Route = createFileRoute("/admin/clients/")({
  component: AdminClientsPage,
  head: () => ({ meta: [{ title: "Clients — Admin" }] }),
});

interface ClientRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  blocked: boolean;
  loan_count: number;
  total_borrowed: number;
}

function AdminClientsPage() {
  const { t } = useTranslation();
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

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
    const [profilesRes, loansRes] = await Promise.all([
      // Cast: blocked column added by migration not yet reflected in generated types
      (supabase
        .from("profiles") as any)
        .select("user_id, full_name, email, phone, created_at, blocked")
        .order("created_at", { ascending: false }),
      supabase.from("loans").select("user_id, amount"),
    ]);
    const aggregates: Record<string, { count: number; sum: number }> = {};
    (loansRes.data ?? []).forEach((l: { user_id: string; amount: number }) => {
      if (!aggregates[l.user_id]) aggregates[l.user_id] = { count: 0, sum: 0 };
      aggregates[l.user_id].count += 1;
      aggregates[l.user_id].sum += Number(l.amount);
    });
    const profilesData = (profilesRes.data ?? []) as Array<{
      user_id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      created_at: string;
      blocked?: boolean | null;
    }>;
    const merged: ClientRow[] = profilesData.map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      created_at: p.created_at,
      blocked: Boolean(p.blocked),
      loan_count: aggregates[p.user_id]?.count ?? 0,
      total_borrowed: aggregates[p.user_id]?.sum ?? 0,
    }));
    setRows(merged);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        (r.full_name ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  if (authLoading || role !== "admin") {
    return <div className="flex items-center justify-center h-96 text-muted-foreground">{t("common.loading")}</div>;
  }

  const blockedCount = rows.filter((r) => r.blocked).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl pb-28 lg:pb-10">
      <div className="flex items-center gap-3 mb-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> {t("common.back")}</Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-serif text-primary flex items-center gap-2">
            <Users className="h-7 w-7" /> {t("admin.clientsPage.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("admin.clientsPage.subtitle")}</p>
        </div>
        <div className="flex gap-3">
          <Card className="border-t-4 border-t-primary">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Clients</p>
              <p className="text-2xl font-bold tabular-nums">{rows.length}</p>
            </CardContent>
          </Card>
          <Card className="border-t-4 border-t-destructive">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("admin.clientsPage.blocked")}</p>
              <p className="text-2xl font-bold tabular-nums text-destructive">{blockedCount}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`${t("common.search")}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">{t("common.loading")}</div>
          ) : filtered.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Users className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>Aucun client</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.clientsPage.client")}</TableHead>
                    <TableHead>{t("admin.clientsPage.phone")}</TableHead>
                    <TableHead className="text-center">{t("admin.clientsPage.loans")}</TableHead>
                    <TableHead className="text-right">{t("admin.clientsPage.totalBorrowed")}</TableHead>
                    <TableHead>{t("admin.clientsPage.joined")}</TableHead>
                    <TableHead>{t("admin.clientsPage.status")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.user_id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="font-medium">{c.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{c.email}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                      <TableCell className="text-center tabular-nums">{c.loan_count}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(c.total_borrowed)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(c.created_at)}</TableCell>
                      <TableCell>
                        {c.blocked ? (
                          <Badge variant="destructive" className="gap-1">
                            <ShieldOff className="h-3 w-3" /> {t("admin.clientsPage.blocked")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1 bg-success/10 text-success border-success/30">
                            <ShieldCheck className="h-3 w-3" /> {t("admin.clientsPage.active")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link to="/admin/clients/$userId" params={{ userId: c.user_id }}>
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
    </div>
  );
}
