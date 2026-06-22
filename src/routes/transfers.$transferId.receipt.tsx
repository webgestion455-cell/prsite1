import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/loan-helpers";
import { isCompletedTransfer } from "@/lib/transfer-state";
import i18n from "@/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/transfers/$transferId/receipt")({
  component: ReceiptPage,
  head: () => ({ meta: [{ title: i18n.t("receipt.metaTitle") }] }),
});

interface Withdrawal {
  id: string;
  amount: number;
  beneficiary: string;
  iban: string;
  bic?: string | null;
  bank_name: string;
  reference: string | null;
  status: string;
  progress?: number | null;
  current_step: number;
  created_at: string;
  processed_at: string | null;
}

function ReceiptPage() {
  const { transferId } = Route.useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [w, setW] = useState<Withdrawal | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("withdrawals").select("*").eq("id", transferId).maybeSingle();
      setW(data as Withdrawal | null);
      setLoading(false);
    })();
  }, [transferId]);

  if (loading) return <div className="flex h-96 items-center justify-center text-muted-foreground">{t("common.loading")}</div>;
  if (!w) return <div className="p-8 text-center text-muted-foreground">{t("transferDetail.notFound")}</div>;

  const completed = isCompletedTransfer(w.status, w.current_step) || Number(w.progress ?? 0) >= 100;
  const issuedOn = w.processed_at ? formatDateTime(w.processed_at) : formatDateTime(w.created_at);

  async function downloadPdf() {
    if (!w) return;
    const current = w;
    setDownloading(true);
    const id = toast.loading(t("receipt.generating"));
    try {
      if (!completed) throw new Error(t("receipt.serverUnavailable"));
      const bytes = await buildReceiptPdf(current);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `justificatif-virement-hsbc-${current.reference ?? current.id.slice(0, 8).toUpperCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("receipt.downloaded"), { id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("receipt.downloadError"), { id });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .receipt-paper { box-shadow: none !important; border: none !important; }
        }
      `}</style>
      <div className="container mx-auto max-w-3xl px-4 pb-28 pt-6 lg:pb-10">
        <div className="no-print mb-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/transfers/$transferId", params: { transferId } })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("common.back")}
          </Button>
          <Button onClick={downloadPdf} disabled={downloading || !completed} className="shadow-glow">
            <Download className="mr-2 h-4 w-4" /> {downloading ? t("receipt.generating") : t("receipt.download")}
          </Button>
        </div>

        <article className="receipt-paper rounded-2xl border border-border bg-white p-8 text-slate-900 shadow-elevated md:p-12">
          {/* En-tête HSBC */}
          <header className="flex items-start justify-between border-b-2 border-[#db0011] pb-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center bg-[#db0011] text-white font-bold">H</div>
                <div>
                  <p className="text-2xl font-semibold tracking-tight text-[#db0011]">BNP PARIBAS</p>
                  <p className="text-[11px] uppercase tracking-widest text-slate-500">{t("receipt.subBrand")}</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-widest text-slate-500">{t("receipt.documentLabel")}</p>
              <p className="font-semibold">{t("receipt.documentTitle")}</p>
              <p className="mt-1 text-xs text-slate-500">N° {w.reference ?? w.id.slice(0, 8).toUpperCase()}</p>
            </div>
          </header>

          {/* Titre */}
          <div className="mt-8">
            <h1 className="text-3xl font-semibold tracking-tight">{t("receipt.title")}</h1>
            <p className="mt-2 text-sm text-slate-600">{t("receipt.subtitle", { date: issuedOn })}</p>
          </div>

          {/* Montant */}
          <div className="mt-8 rounded-xl bg-slate-50 p-6">
            <p className="text-xs uppercase tracking-widest text-slate-500">{t("receipt.amount")}</p>
            <p className="mt-1 font-serif text-4xl font-medium tabular-nums">{formatCurrency(Number(w.amount))}</p>
            <p className="mt-1 text-xs text-slate-500">{t(completed ? "receipt.statusExecuted" : "receipt.statusPending")}</p>
          </div>

          {/* Détails */}
          <section className="mt-8 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <Row label={t("receipt.beneficiary")} value={w.beneficiary} />
            <Row label={t("receipt.bank")} value={w.bank_name} />
            <Row label={t("receipt.iban")} value={w.iban} mono />
            {w.bic && <Row label={t("receipt.bic")} value={w.bic} mono />}
            <Row label={t("receipt.reference")} value={w.reference ?? "—"} />
            <Row label={t("receipt.issuedAt")} value={issuedOn} />
          </section>

          {/* Pied */}
          <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-[#db0011]" />
              <span>{t("receipt.footerSecurity")}</span>
            </div>
            <p className="mt-2">{t("receipt.footerLegal")}</p>
            <p className="mt-3 text-[10px] uppercase tracking-widest text-slate-400">
              HSBC France · 38 av. Kléber, 75116 Paris · SIREN 775 670 284
            </p>
          </footer>
        </article>
      </div>
    </>
  );
}

async function buildReceiptPdf(w: Withdrawal) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = page.getWidth();
  const height = page.getHeight();
  const margin = 48;
  const red = rgb(0.86, 0, 0.07);
  const ink = rgb(0.08, 0.09, 0.12);
  const muted = rgb(0.42, 0.45, 0.50);
  const line = rgb(0.86, 0.87, 0.90);
  const clean = (value: string) => value.replace(/[\u202F\u00A0\u2009]/g, " ").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-");
  const draw = (text: string, x: number, y: number, size = 10, font = regular, color = ink) => page.drawText(clean(text), { x, y, size, font, color });
  const row = (label: string, value: string, x: number, y: number) => {
    draw(label.toUpperCase(), x, y, 8, bold, muted);
    draw(value || "—", x, y - 16, 11, regular, ink);
    page.drawLine({ start: { x, y: y - 24 }, end: { x: x + 225, y: y - 24 }, thickness: 0.5, color: line });
  };
  const ref = w.reference || w.id.slice(0, 8).toUpperCase();
  const issued = formatDateTime(w.processed_at || w.created_at);

  page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: rgb(0.985, 0.985, 0.98) });
  page.drawRectangle({ x: margin, y: height - 64, width: 34, height: 34, color: red });
  draw("H", margin + 10, height - 55, 18, bold, rgb(1, 1, 1));
  draw("BNP PARIBAS", margin + 46, height - 45, 18, bold, red);
  draw("Justificatif bancaire officiel", margin + 46, height - 61, 9, regular, muted);
  draw(`N° ${ref}`, width - margin - bold.widthOfTextAtSize(`N° ${ref}`, 10), height - 47, 10, bold, ink);
  draw("Document sécurisé", width - margin - 90, height - 62, 8, regular, muted);
  draw("Justificatif de virement", margin, height - 138, 24, bold, ink);
  draw(`Émis le ${issued}`, margin, height - 158, 10, regular, muted);
  page.drawRectangle({ x: margin, y: height - 248, width: width - margin * 2, height: 68, color: rgb(0.97, 0.98, 0.99), borderColor: line, borderWidth: 1 });
  draw("MONTANT TRANSFÉRÉ", margin + 18, height - 204, 8, bold, muted);
  draw(formatCurrency(Number(w.amount)), margin + 18, height - 232, 26, bold, ink);
  draw("STATUT", width - margin - 120, height - 204, 8, bold, muted);
  draw("Virement exécuté", width - margin - 120, height - 226, 12, bold, red);
  const y1 = height - 300;
  row("Bénéficiaire", w.beneficiary, margin, y1);
  row("Banque bénéficiaire", w.bank_name, margin + 270, y1);
  row("IBAN", w.iban, margin, y1 - 62);
  row("BIC / SWIFT", w.bic || "—", margin + 270, y1 - 62);
  row("Référence", ref, margin, y1 - 124);
  row("Date d'exécution", issued, margin + 270, y1 - 124);
  page.drawRectangle({ x: margin, y: 128, width: width - margin * 2, height: 62, color: rgb(1, 1, 1), borderColor: line, borderWidth: 1 });
  draw("Document généré par les systèmes sécurisés BNP PARIBAS.", margin + 16, 166, 9, bold, ink);
  draw("Ce justificatif fait foi de l'opération bancaire et peut être présenté à toute autorité compétente.", margin + 16, 150, 8.5, regular, muted);
  page.drawLine({ start: { x: margin, y: 82 }, end: { x: width - margin, y: 82 }, thickness: 0.5, color: line });
  draw("HSBC France · 38 av. Kléber, 75116 Paris · SIREN 775 670 284", margin, 64, 8, regular, muted);
  draw(`Page 1 / 1 · ${ref}`, width - margin - 110, 64, 8, regular, muted);
  return pdf.save();
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-b border-slate-100 pb-2">
      <p className="text-[11px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 ${mono ? "font-mono text-sm" : "text-sm font-medium"}`}>{value}</p>
    </div>
  );
}
