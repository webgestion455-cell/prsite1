import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldAlert, LogOut } from "lucide-react";

interface BlockedState {
  blocked: boolean;
  reason: string | null;
}

export function BlockedAccountGuard({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useAuth();
  const { t } = useTranslation();
  const [state, setState] = useState<BlockedState | null>(null);

  useEffect(() => {
    if (!user) {
      setState(null);
      return;
    }
    // Admins bypass any blocking flag (sécurité contre auto-blocage)
    if (role === "admin") {
      setState({ blocked: false, reason: null });
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("blocked, blocked_reason")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      // Si la colonne n'existe pas encore (migration non appliquée), on traite comme non bloqué
      const row = data as { blocked?: boolean; blocked_reason?: string | null } | null;
      setState({
        blocked: Boolean(row?.blocked),
        reason: row?.blocked_reason ?? null,
      });
    })();
    return () => {
      active = false;
    };
  }, [user, role]);

  if (state?.blocked) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">{t("blocked.title")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("blocked.message")}</p>
          {state.reason && (
            <div className="mt-4 rounded-xl bg-card border border-border p-3 text-left text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("blocked.reasonLabel")}
              </p>
              <p className="mt-1 text-foreground">{state.reason}</p>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">{t("blocked.contact")}</p>
          <Button
            className="mt-6 w-full"
            variant="outline"
            onClick={async () => {
              await signOut();
              window.location.href = "/";
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("blocked.signOut")}
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
