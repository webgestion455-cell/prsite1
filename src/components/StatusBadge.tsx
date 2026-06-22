import { cn } from "@/lib/utils";
import type { LoanStatus } from "@/lib/loan-helpers";
import { STATUS_VARIANTS, tStatus } from "@/lib/loan-helpers";
import { useTranslation } from "react-i18next";

const VARIANT_STYLES: Record<string, string> = {
  default: "bg-secondary text-secondary-foreground border-border",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
  muted: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status, className }: { status: LoanStatus; className?: string }) {
  // re-render when language changes
  useTranslation();
  const variant = STATUS_VARIANTS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        VARIANT_STYLES[variant],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {tStatus(status)}
    </span>
  );
}
