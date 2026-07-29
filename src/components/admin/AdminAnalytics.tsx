import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, STATUS_LABELS, type LoanStatus } from "@/lib/loan-helpers";
import { BarChart3, PieChart as PieIcon, Layers } from "lucide-react";

export interface AnalyticsLoan {
  amount: number;
  status: LoanStatus;
  created_at: string;
  disbursed_amount?: number;
}
export interface AnalyticsWithdrawal {
  amount: number;
  status: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  en_attente: "hsl(var(--warning))",
  accepte: "hsl(var(--success))",
  refuse: "hsl(var(--destructive))",
  contrat_envoye: "hsl(var(--info))",
  contrat_signe: "hsl(var(--accent))",
  en_traitement: "hsl(var(--primary))",
  fonds_disponibles: "hsl(var(--success))",
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function AdminAnalytics({
  loans,
  withdrawals,
}: {
  loans: AnalyticsLoan[];
  withdrawals: AnalyticsWithdrawal[];
}) {
  const months = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push({
        key: monthKey(d),
        label: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
      });
    }
    return list;
  }, []);

  const volumeData = useMemo(
    () =>
      months.map((m) => {
        const l = loans.filter((x) => monthKey(new Date(x.created_at)) === m.key);
        const w = withdrawals.filter((x) => monthKey(new Date(x.created_at)) === m.key);
        return {
          mois: m.label,
          demandes: l.reduce((s, x) => s + Number(x.amount || 0), 0),
          virements: w.reduce((s, x) => s + Number(x.amount || 0), 0),
          dossiers: l.length,
        };
      }),
    [months, loans, withdrawals],
  );

  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    loans.forEach((l) => map.set(l.status, (map.get(l.status) ?? 0) + 1));
    return Array.from(map.entries()).map(([status, value]) => ({
      name: STATUS_LABELS[status as LoanStatus] ?? status,
      value,
      color: STATUS_COLORS[status] ?? "hsl(var(--muted-foreground))",
    }));
  }, [loans]);

  const funnel = useMemo(() => {
    const count = (fn: (s: LoanStatus) => boolean) => loans.filter((l) => fn(l.status)).length;
    return [
      { etape: "Reçues", valeur: loans.length },
      { etape: "Acceptées", valeur: count((s) => s !== "en_attente" && s !== "refuse") },
      { etape: "Contrats", valeur: count((s) => ["contrat_signe", "en_traitement", "fonds_disponibles"].includes(s)) },
      { etape: "Financés", valeur: count((s) => s === "fonds_disponibles") },
    ];
  }, [loans]);

  const tooltipStyle = {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 12,
    fontSize: 12,
    color: "hsl(var(--popover-foreground))",
  };

  return (
    <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2 border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-lg bg-accent/10 text-accent grid place-items-center shrink-0">
              <BarChart3 className="h-4 w-4" />
            </div>
            <span className="truncate">Volumes sur 12 mois</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-1 sm:px-4">
          <div className="h-[240px] sm:h-[280px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={volumeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gDemandes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gVirements" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mois" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis
                  width={54}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, n: string) => [formatCurrency(Number(v)), n === "demandes" ? "Demandes" : "Virements"]}
                />
                <Area type="monotone" dataKey="demandes" stroke="hsl(var(--accent))" strokeWidth={2} fill="url(#gDemandes)" />
                <Area type="monotone" dataKey="virements" stroke="hsl(var(--success))" strokeWidth={2} fill="url(#gVirements)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
              <PieIcon className="h-4 w-4" />
            </div>
            <span className="truncate">Répartition des dossiers</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={3}>
                  {statusData.map((d) => (
                    <Cell key={d.name} fill={d.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1.5">
            {statusData.map((d) => (
              <li key={d.name} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.name}</span>
                <span className="shrink-0 font-semibold tabular-nums">{d.value}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="xl:col-span-3 border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-lg bg-success/10 text-success grid place-items-center shrink-0">
              <Layers className="h-4 w-4" />
            </div>
            <span className="truncate">Entonnoir de conversion</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-1 sm:px-4">
          <div className="h-[200px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="etape" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis width={36} allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar dataKey="valeur" radius={[8, 8, 0, 0]} fill="hsl(var(--accent))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
