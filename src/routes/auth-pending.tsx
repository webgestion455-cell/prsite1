import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MailCheck, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/auth-pending")({
  component: AuthPending,
});

function AuthPending() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.body.style.background = "#05070f";
    return () => {
      document.body.style.background = "";
    };
  }, []);

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/dashboard" });
    }
  }, [user, loading, navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 text-white overflow-hidden">

      {/* BACKGROUND GRADIENT */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-slate-900 to-black opacity-90" />
      <div className="absolute inset-0 backdrop-blur-3xl" />

      {/* GLOW EFFECT ORB */}
      <div className="absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl animate-pulse" />

      {/* CARD */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl">

        {/* ICON */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/10 shadow-[0_0_40px_rgba(59,130,246,0.4)] animate-pulse">
          <MailCheck className="h-8 w-8 text-blue-400" />
        </div>

        {/* TITLE */}
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("authPending.title")}
        </h1>

        {/* DESCRIPTION */}
        <p className="mt-3 text-sm text-gray-300">
          {t("authPending.description")}
        </p>

        {/* INSTRUCTION */}
        <p className="mt-2 text-xs text-gray-400">
          {t("authPending.instruction")}
        </p>

        {/* LOADING */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
          <RefreshCw className="h-3 w-3 animate-spin" />
          {t("authPending.loading")}
        </div>

        {/* SECURITY NOTE */}
        <div className="mt-8 border-t border-white/10 pt-4 text-[11px] text-gray-500">
          {t("authPending.footer")}
        </div>

      </div>
    </div>
  );
}