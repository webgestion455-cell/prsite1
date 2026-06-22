export type TransferServerStatus = string | null | undefined;
export type TransferPhase = "animating" | "blocked" | "final" | "rejected";

export const TRANSFER_TARGETS = [63, 88, 100] as const;
export const TRANSFER_STEP_DURATION_MS: Record<number, number> = {
  63: 60_000,
  88: 30_000,
  100: 25_000,
};

export function normalizeTransferStatus(status: TransferServerStatus) {
  return String(status ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isRejectedTransfer(status: TransferServerStatus) {
  return ["refuse", "rejete", "rejected", "declined", "cancelled", "annule"].includes(
    normalizeTransferStatus(status),
  );
}

export function isCompletedTransfer(status: TransferServerStatus, currentStep = 0) {
  return (
    currentStep >= 3 ||
    ["envoye", "validated", "completed", "complete", "execute", "sent"].includes(normalizeTransferStatus(status))
  );
}

export function targetForTransferStep(stepIndex: number): number {
  if (stepIndex >= 3) return 100;
  return TRANSFER_TARGETS[Math.max(0, stepIndex)] ?? 63;
}

export function previousTargetForTransferStep(stepIndex: number): number {
  if (stepIndex <= 0) return 0;
  return TRANSFER_TARGETS[Math.min(TRANSFER_TARGETS.length - 1, stepIndex - 1)] ?? 0;
}

export function deriveTransferPhase(params: {
  status: TransferServerStatus;
  progress: number;
  currentStep: number;
}) : TransferPhase {
  if (isRejectedTransfer(params.status)) return "rejected";
  if (isCompletedTransfer(params.status, params.currentStep) || params.progress >= 100) return "final";
  const target = targetForTransferStep(params.currentStep);
  return params.progress >= target ? "blocked" : "animating";
}