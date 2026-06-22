import { Download, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  href?: string;
  className?: string;
}

/**
 * Pro 3D animated download button — perspective tilt, glow, gradient sheen.
 */
export function DownloadAppButton({ href = "https://hsyxjqffrfceorbogvha.supabase.co/storage/v1/object/public/hsbc-app/app-debug.apk", className = "" }: Props) {
  const { t } = useTranslation();
  return (
    <a
      href={href}
      download
      className={`group relative inline-flex items-center gap-3 rounded-2xl px-7 py-4 text-base font-semibold text-white transition-transform duration-300 [perspective:1000px] hover:-translate-y-0.5 active:translate-y-0 ${className}`}
      style={{
        background: "linear-gradient(135deg,#059669 0%,#047857 50%,#064e3b 100%)",
        boxShadow:
          "0 10px 30px -10px rgba(5,150,105,0.55), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -3px 0 rgba(0,0,0,0.25)",
      }}
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(120% 80% at 50% -20%, rgba(255,255,255,0.45) 0%, transparent 60%)",
        }}
      />
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30 transition-transform duration-300 group-hover:[transform:rotateY(20deg)]">
        <Smartphone className="h-5 w-5" />
      </span>
      <span className="relative flex flex-col items-start leading-tight">
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/70">
          {t("download.eyebrow", "Available for")}
        </span>
        <span className="text-base font-bold">{t("download.label", "Download the app")}</span>
      </span>
      <Download className="relative ml-1 h-5 w-5 transition-transform duration-300 group-hover:translate-y-0.5" />
      <span
        className="pointer-events-none absolute -bottom-2 left-3 right-3 h-3 rounded-full opacity-60 blur-md transition-opacity group-hover:opacity-90"
        style={{ background: "rgba(5,150,105,0.55)" }}
      />
    </a>
  );
}
