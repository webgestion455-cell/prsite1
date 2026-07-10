import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Wallet,
  ArrowRightLeft,
  MessageCircle,
  Bell,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
}

function AdminLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { user, profile, signOut } = useAuth() as any;
  const [openMobile, setOpenMobile] = useState(false);

  const nav: NavItem[] = useMemo(
    () => [
      { to: "/admin", labelKey: "adminDash.overview", icon: LayoutDashboard, match: (p) => p === "/admin" || p === "/admin/" },
      { to: "/admin/clients", labelKey: "adminDash.clients", icon: Users, match: (p) => p.startsWith("/admin/clients") },
      { to: "/admin/loans", labelKey: "adminDash.loans", icon: Wallet, match: (p) => p.startsWith("/admin/loans") },
      { to: "/admin/transfers/new", labelKey: "adminDash.transfers", icon: ArrowRightLeft, match: (p) => p.startsWith("/admin/transfers") },
      { to: "/admin/chat", labelKey: "adminDash.chat", icon: MessageCircle, match: (p) => p.startsWith("/admin/chat") },
      { to: "/admin/notifications", labelKey: "adminDash.notifications", icon: Bell, match: (p) => p.startsWith("/admin/notifications") },
      { to: "/admin/security", labelKey: "adminDash.security", icon: ShieldCheck, match: (p) => p.startsWith("/admin/security") },
    ],
    [],
  );

  const adminName = profile?.full_name ?? user?.email?.split("@")[0] ?? "Admin";

  return (
    <div className="min-h-screen bg-muted/20 flex">
      {/* SIDEBAR desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-card border-r border-border sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-[#00915A] grid place-items-center text-white font-bold">B</div>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight">BNP PARIBAS</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("adminDash.title")}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {nav.map((n) => {
            const active = n.match(pathname);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition",
                  active
                    ? "bg-[#00915A] text-white font-semibold shadow-sm"
                    : "text-foreground/80 hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                {t(n.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <button
            onClick={() => signOut?.()}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted text-muted-foreground"
          >
            <LogOut className="h-4 w-4" /> Déconnexion
          </button>
        </div>
      </aside>

      {/* MOBILE DRAWER */}
      {openMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-card border-r border-border p-4 space-y-3 overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="font-bold">Admin</p>
              <button onClick={() => setOpenMobile(false)}><X className="h-5 w-5" /></button>
            </div>
            {nav.map((n) => {
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpenMobile(false)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-muted"
                >
                  <Icon className="h-4 w-4" /> {t(n.labelKey)}
                </Link>
              );
            })}
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setOpenMobile(false)} />
        </div>
      )}

      {/* MAIN */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* TOPBAR */}
        <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border">
          <div className="flex items-center gap-3 px-4 h-14">
            <button className="lg:hidden" onClick={() => setOpenMobile(true)} aria-label="Menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden md:flex items-center gap-2 flex-1 max-w-md rounded-lg border border-border bg-muted/40 px-3 py-1.5">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("chat.admin.searchPlaceholder")}
                className="bg-transparent text-sm outline-none flex-1"
              />
            </div>
            <div className="flex-1 md:hidden" />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <NotificationBell />
              <div className="h-9 w-9 rounded-full bg-[#00915A] text-white grid place-items-center text-sm font-semibold">
                {adminName.slice(0, 1).toUpperCase()}
              </div>
              <div className="hidden md:block text-xs leading-tight">
                <p className="font-semibold">{adminName}</p>
                <p className="text-muted-foreground">Administrateur</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
