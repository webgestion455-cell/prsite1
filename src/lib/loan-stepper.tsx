import {
  CheckCircle2,
  Clock,
  XCircle,
  FileSignature,
  FileCheck2,
  Wallet,
  Hourglass,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LoanStatus } from "@/lib/loan-helpers";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger" | "primary";

export const TONE_CLASSES: Record<StatusTone, { bg: string; text: string; border: string; dot: string }> = {
  neutral: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border", dot: "bg-muted-foreground" },
  info: { bg: "bg-info/10", text: "text-info", border: "border-info/30", dot: "bg-info" },
  warning: { bg: "bg-warning/10", text: "text-warning", border: "border-warning/30", dot: "bg-warning" },
  success: { bg: "bg-success/10", text: "text-success", border: "border-success/30", dot: "bg-success" },
  danger: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30", dot: "bg-destructive" },
  primary: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/30", dot: "bg-primary" },
};

/**
 * Static metadata (tone + icon) per status.
 * Labels & descriptions are intentionally left as fallback FR strings; the UI must
 * read translated values via i18n keys (`status.*`, `loanDetail.loanDescription.*`).
 */
export const LOAN_STATUS_META: Record<
  LoanStatus,
  { label: string; tone: StatusTone; icon: LucideIcon; description: string }
> = {
  en_attente:        { label: "En attente",        tone: "warning", icon: Hourglass,    description: "Votre demande est en cours d'examen" },
  accepte:           { label: "Acceptée",          tone: "success", icon: CheckCircle2, description: "Votre demande a été acceptée" },
  refuse:            { label: "Refusée",           tone: "danger",  icon: XCircle,      description: "Demande non aboutie" },
  contrat_envoye:    { label: "Contrat envoyé",    tone: "info",    icon: Send,         description: "Le contrat vous a été envoyé pour signature" },
  contrat_signe:     { label: "Contrat signé",     tone: "primary", icon: FileCheck2,   description: "Contrat signé reçu, déblocage en préparation" },
  en_traitement:     { label: "En traitement",     tone: "warning", icon: Clock,        description: "Mise à disposition des fonds sous 72h" },
  fonds_disponibles: { label: "Fonds disponibles", tone: "success", icon: Wallet,       description: "Vos fonds sont disponibles" },
};

export const LOAN_STEPS: Array<{ id: LoanStatus; icon: LucideIcon }> = [
  { id: "en_attente",        icon: FileSignature },
  { id: "accepte",           icon: CheckCircle2 },
  { id: "contrat_envoye",    icon: Send },
  { id: "contrat_signe",     icon: FileCheck2 },
  { id: "en_traitement",     icon: Clock },
  { id: "fonds_disponibles", icon: Wallet },
];

export function getStepState(currentStatus: LoanStatus, stepId: LoanStatus): "done" | "current" | "pending" {
  const order = LOAN_STEPS.map((s) => s.id);
  const ci = order.indexOf(currentStatus);
  const si = order.indexOf(stepId);
  if (ci < 0 || si < 0) return "pending";
  if (si < ci) return "done";
  if (si === ci) return "current";
  return "pending";
}

function StepperBubble({
  state,
  icon: Icon,
}: {
  state: "done" | "current" | "pending";
  icon: LucideIcon;
}) {
  return (
    <span
      className={cn(
        "relative z-10 h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 border-2",
        state === "done" && "bg-success border-success text-white shadow-md",
        state === "current" && "bg-accent border-accent text-white shadow-glow ring-4 ring-accent/20 animate-pulse",
        state === "pending" && "bg-card border-border text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function LoanStepper({ currentStatus }: { currentStatus: LoanStatus }) {
  const { t } = useTranslation();
  const currentIndex = LOAN_STEPS.findIndex((s) => s.id === currentStatus);
  const progressPct = currentIndex < 0 ? 0 : (currentIndex / (LOAN_STEPS.length - 1)) * 100;

  const label = (id: LoanStatus) => t(`loanDetail.steps.${id}`, { defaultValue: LOAN_STATUS_META[id].label });

  return (
    <div className="relative">
      {/* Desktop */}
      <div className="hidden md:block">
        <div className="relative">
          <div className="absolute top-5 left-5 right-5 h-1 bg-muted rounded-full" />
          <div
            className="absolute top-5 left-5 h-1 bg-gradient-to-r from-accent to-success rounded-full transition-all duration-700"
            style={{ width: `calc(${progressPct}% - ${(progressPct / 100) * 40}px)` }}
          />
          <ol className="relative grid grid-cols-6 gap-2">
            {LOAN_STEPS.map((step) => {
              const state = getStepState(currentStatus, step.id);
              return (
                <li key={step.id} className="flex flex-col items-center text-center">
                  <StepperBubble state={state} icon={step.icon} />
                  <span
                    className={cn(
                      "mt-3 text-xs font-medium leading-tight px-1",
                      state === "done" && "text-foreground",
                      state === "current" && "text-foreground font-semibold",
                      state === "pending" && "text-muted-foreground",
                    )}
                  >
                    {label(step.id)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Mobile */}
      <ol className="md:hidden relative space-y-4 before:absolute before:left-5 before:top-5 before:bottom-5 before:w-0.5 before:bg-muted">
        {LOAN_STEPS.map((step) => {
          const state = getStepState(currentStatus, step.id);
          return (
            <li key={step.id} className="relative flex items-center gap-4">
              <StepperBubble state={state} icon={step.icon} />
              <span
                className={cn(
                  "text-sm font-medium",
                  state === "done" && "text-foreground",
                  state === "current" && "text-foreground font-semibold",
                  state === "pending" && "text-muted-foreground",
                )}
              >
                {label(step.id)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
