import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, FilePlus2, Home, MessageCircle, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";

export function MobileBottomNav() {
  const { user, role } = useAuth();
  const { location } = useRouterState();
  const { t } = useTranslation();
  if (!user) return null;

  const isAdminArea = location.pathname.startsWith("/admin");
  const items = isAdminArea && role === "admin"
    ? [
        { to: "/admin" as const, label: t("header.admin"), icon: ShieldCheck },
        { to: "/admin/chat" as const, label: t("chat.nav"), icon: MessageCircle },
        { to: "/settings" as const, label: t("header.settings"), icon: SettingsIcon },
      ]
    : [
        { to: "/dashboard" as const, label: t("nav.home"), icon: Home },
        { to: "/transfers" as const, label: t("nav.transfers"), icon: ArrowLeftRight },
        { to: "/loans/new" as const, label: t("nav.request"), icon: FilePlus2 },
        { to: "/chat" as const, label: t("chat.nav"), icon: MessageCircle },
        { to: "/settings" as const, label: t("header.settings"), icon: SettingsIcon },
      ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl sm:hidden"
      aria-label={t("nav.primary")}
    >
      <div className={`mx-auto grid max-w-md gap-1 ${items.length === 5 ? "grid-cols-5" : items.length === 4 ? "grid-cols-4" : items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-2 text-[10.5px] font-medium transition-colors ${
                active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "scale-110" : ""} transition-transform`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
