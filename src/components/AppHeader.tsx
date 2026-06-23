import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings as SettingsIcon, Mail, ShieldCheck, LayoutDashboard } from "lucide-react";
import bnpparibasLogo from "@/assets/bnpparibas-logo.png";

function initialsFrom(name: string | null | undefined, email: string | null | undefined) {
  const src = (name && name.trim()) || (email ?? "");
  if (!src) return "•";
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || src[0].toUpperCase();
}

export function AppHeader() {
  const { t } = useTranslation();
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [fullName, setFullName] = useState<string>("");

  const isAdminArea = location.pathname.startsWith("/admin");
  const onApp =
    location.pathname.startsWith("/dashboard") ||
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/loans");

  useEffect(() => {
    if (!user) {
      setFullName("");
      return;
    }
    void supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setFullName(data?.full_name ?? ""));
  }, [user?.id]);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/" });
  }

  const initials = initialsFrom(fullName, user?.email);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 sm:gap-2.5 transition-opacity hover:opacity-80 min-w-0">
          <img
            src={bnpparibasLogo}
            alt="BNP PARIBAS"
            width={36}
            height={36}
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-md object-contain bg-white p-0.5 shadow-sm shrink-0"
          />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="font-serif text-sm sm:text-lg font-medium tracking-tight truncate">BNP PARIBAS</span>
            {isAdminArea && role === "admin" && (
              <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                Espace sécurisé · Admin
              </span>
            )}
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {user ? (
            <>
              <NotificationBell />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("header.settings")}
                    className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold hover:bg-primary/20"
                  >
                    <span className="text-xs">{initials}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">{fullName || t("header.dashboard")}</span>
                    <span className="text-xs font-normal text-muted-foreground truncate">{user.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {role === "admin" && isAdminArea ? (
                    <DropdownMenuItem onClick={() => navigate({ to: "/admin" })}>
                      <ShieldCheck className="mr-2 h-4 w-4" /> {t("header.admin")}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => navigate({ to: "/dashboard" })}>
                      <LayoutDashboard className="mr-2 h-4 w-4" /> {t("header.dashboard")}
                    </DropdownMenuItem>
                  )}
                  {!isAdminArea && (
                    <DropdownMenuItem onClick={() => navigate({ to: "/contact" })}>
                      <Mail className="mr-2 h-4 w-4" /> {t("header.contact")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                    <SettingsIcon className="mr-2 h-4 w-4" /> {t("header.settings")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /> {t("header.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            !onApp && (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth">{t("header.signIn")}</Link>
                </Button>
                <Button asChild size="sm" className="hidden sm:inline-flex shadow-glow">
                  <Link to="/auth">{t("header.newLoan")}</Link>
                </Button>
              </>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
