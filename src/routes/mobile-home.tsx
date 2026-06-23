import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Sparkles, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/mobile-home")({
  component: MobileHomePage,
});

function MobileHomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function handleStart() {
    try {
      localStorage.setItem("bnpparibas.mobileOnboarding.seen", "1");
    } catch {
      /* ignore */
    }
    navigate({ to: "/auth" });
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[radial-gradient(120%_80%_at_50%_0%,#1a1a2e_0%,#0a0a14_55%,#000_100%)] text-white">
      {/* Ambient glow orbs */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full bg-[hsl(0,80%,55%)]/30 blur-3xl transition-all duration-[1400ms] ease-out ${mounted ? "opacity-70 scale-100" : "opacity-0 scale-90"}`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-[hsl(220,80%,55%)]/25 blur-3xl transition-all duration-[1600ms] ease-out delay-150 ${mounted ? "opacity-80 scale-100" : "opacity-0 scale-90"}`}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* Top brand row */}
        <div
          className={`flex items-center gap-2 transition-all duration-700 ease-out ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"}`}
        >
          <div className="flex h-7 w-7 items-center justify-center">
            <div className="relative h-6 w-6">
              <div className="absolute inset-0 border border-white/70" />
              <div className="absolute top-0 left-0 h-1/2 w-1/2 bg-[hsl(0,85%,55%)]" />
              <div className="absolute bottom-0 right-0 h-1/2 w-1/2 bg-[hsl(0,85%,55%)]" />
            </div>
          </div>
          <span className="text-sm font-semibold tracking-[0.2em] text-white/90">BNP PARIBAS</span>
        </div>

        {/* Logo / Hero */}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div
            className={`group relative mb-10 transition-all duration-1000 ease-out ${mounted ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-75 -rotate-12"}`}
            style={{ transformStyle: "preserve-3d", perspective: "800px" }}
          >
            <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-white/10 blur-2xl" />
            <div
              className="relative h-28 w-28 rounded-3xl border border-white/15 bg-gradient-to-br from-white/15 to-white/5 p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl"
              style={{ transform: "rotateX(8deg) rotateY(-8deg)" }}
            >
              <div className="relative h-full w-full">
                <div className="absolute inset-0 border-2 border-white" />
                <div className="absolute top-0 left-0 h-1/2 w-1/2 bg-[hsl(0,85%,55%)]" />
                <div className="absolute bottom-0 right-0 h-1/2 w-1/2 bg-[hsl(0,85%,55%)]" />
              </div>
            </div>
          </div>

          <h1
            className={`font-serif text-4xl font-medium leading-tight transition-all duration-700 ease-out delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            {t("mobileHome.title")}
          </h1>

          <p
            className={`mt-4 text-lg font-light text-white/85 transition-all duration-700 ease-out delay-[350ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            {t("mobileHome.subtitle")}
          </p>

          <p
            className={`mt-3 max-w-sm text-sm leading-relaxed text-white/55 transition-all duration-700 ease-out delay-[500ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            {t("mobileHome.description")}
          </p>

          {/* Feature pills */}
          <div
            className={`mt-8 flex flex-wrap items-center justify-center gap-2 transition-all duration-700 ease-out delay-[650ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("mobileHome.feature1")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
              <Lock className="h-3.5 w-3.5" />
              {t("mobileHome.feature2")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              {t("mobileHome.feature3")}
            </span>
          </div>
        </div>

        {/* CTA */}
        <div
          className={`mt-8 transition-all duration-700 ease-out delay-[800ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <Button
            onClick={handleStart}
            className="group relative h-14 w-full overflow-hidden rounded-2xl bg-white text-base font-semibold text-black shadow-[0_20px_50px_-15px_rgba(255,255,255,0.45)] hover:bg-white/95"
          >
            <span className="relative z-10 inline-flex items-center gap-2">
              {t("mobileHome.cta")}
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
            <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/60 opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
          </Button>

          <p className="mt-4 text-center text-[11px] uppercase tracking-[0.18em] text-white/40">
            {t("mobileHome.tagline")}
          </p>
        </div>
      </div>
    </div>
  );
}
