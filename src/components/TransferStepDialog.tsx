import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { TransferProcessPanel } from "@/components/TransferProcessPanel";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onClose: () => void;
  withdrawalId: string;
  loanId: string;
  /** Valeurs initiales — recalées en realtime via la subscription. */
  currentProgress: number;
  currentStep: number;
  onAdvanced?: () => void;
}

interface WithdrawalSnapshot {
  progress: number;
  current_step: number;
  step_started_at: string;
  status: string | null;
}

export function TransferStepDialog({
  open,
  onClose,
  withdrawalId,
  loanId,
  currentProgress,
  currentStep,
  onAdvanced,
}: Props) {
  const { t } = useTranslation();
  const [snap, setSnap] = useState<WithdrawalSnapshot>({
    progress: currentProgress,
    current_step: currentStep,
    step_started_at: new Date().toISOString(),
    status: null,
  });

  useEffect(() => {
    if (!open) return;
    void refresh();
    const ch = supabase
      .channel(`wd-step-${withdrawalId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "withdrawals", filter: `id=eq.${withdrawalId}` },
        (payload) => {
          const r = payload.new as any;
          setSnap({
            progress: r.progress ?? 0,
            current_step: r.current_step ?? 0,
            step_started_at: r.step_started_at ?? new Date().toISOString(),
            status: r.status ?? null,
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, withdrawalId]);

  async function refresh() {
    const { data } = await supabase
      .from("withdrawals")
      .select("progress, current_step, step_started_at, status")
      .eq("id", withdrawalId)
      .maybeSingle();
    if (data) {
      setSnap({
        progress: (data as any).progress ?? 0,
        current_step: (data as any).current_step ?? 0,
        step_started_at: (data as any).step_started_at ?? new Date().toISOString(),
        status: (data as any).status ?? null,
      });
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="font-serif text-xl">{t("transferStepDialog.title")}</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("transferStepDialog.subtitle")}
        </p>

        <div className="mt-6">
          <TransferProcessPanel
            withdrawalId={withdrawalId}
            loanId={loanId}
            progress={snap.progress}
            currentStep={snap.current_step}
            stepStartedAt={snap.step_started_at}
            status={snap.status ?? undefined}
            onChanged={() => {
              void refresh();
              onAdvanced?.();
            }}
            compact
          />
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
