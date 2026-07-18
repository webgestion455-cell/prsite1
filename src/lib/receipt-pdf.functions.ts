import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Buffer } from "node:buffer";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const inputSchema = z.object({
  transferId: z.string().uuid(),
  accessToken: z.string().min(20),
});

function sanitize(s: string) {
  return String(s ?? "")
    .replace(/[\u202F\u00A0\u2009]/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");
}

function fmtEUR(n: number) {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
  } catch {
    return `${n.toFixed(2)} EUR`;
  }
}

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const generateReceiptPdf = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (authError || !authData.user) throw new Error("Session expirée");

    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", authData.user.id);
    const isAdmin = roles?.some((r) => r.role === "admin") ?? false;

    const { data: w, error } = await supabaseAdmin
      .from("withdrawals")
      .select("*")
      .eq("id", data.transferId)
      .maybeSingle();

    if (error || !w) throw new Error("Virement introuvable");
    if (!isAdmin && (w as any).user_id !== authData.user.id) throw new Error("Non autorisé");

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const width = page.getWidth();
    const height = page.getHeight();
    const margin = 48;
    const red = rgb(0.86, 0, 0.07);
    const ink = rgb(0.08, 0.09, 0.12);
    const muted = rgb(0.42, 0.45, 0.5);
    const line = rgb(0.86, 0.87, 0.9);

    const draw = (t: string, x: number, y: number, size = 10, font = helv, color = ink) =>
      page.drawText(sanitize(t), { x, y, size, font, color });

    const ref = (w as any).reference || String((w as any).id).slice(0, 8).toUpperCase();
    const issued = fmtDate((w as any).processed_at || (w as any).created_at);
    const amount = Number((w as any).amount);

    page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: rgb(0.985, 0.985, 0.98) });
    page.drawRectangle({ x: margin, y: height - 64, width: 34, height: 34, color: red });
    draw("H", margin + 10, height - 55, 18, helvBold, rgb(1, 1, 1));
    draw("BNP PARIBAS", margin + 46, height - 45, 18, helvBold, red);
    draw("Justificatif bancaire officiel", margin + 46, height - 61, 9, helv, muted);
    const refLabel = `N° ${ref}`;
    draw(refLabel, width - margin - helvBold.widthOfTextAtSize(refLabel, 10), height - 47, 10, helvBold, ink);
    draw("Document sécurisé", width - margin - 90, height - 62, 8, helv, muted);

    draw("Justificatif de virement", margin, height - 138, 24, helvBold, ink);
    draw(`Émis le ${issued}`, margin, height - 158, 10, helv, muted);

    page.drawRectangle({
      x: margin,
      y: height - 248,
      width: width - margin * 2,
      height: 68,
      color: rgb(0.97, 0.98, 0.99),
      borderColor: line,
      borderWidth: 1,
    });
    draw("MONTANT TRANSFÉRÉ", margin + 18, height - 204, 8, helvBold, muted);
    draw(fmtEUR(amount), margin + 18, height - 232, 26, helvBold, ink);
    draw("STATUT", width - margin - 120, height - 204, 8, helvBold, muted);
    draw("Virement exécuté", width - margin - 120, height - 226, 12, helvBold, red);

    const row = (label: string, value: string, x: number, y: number) => {
      draw(label.toUpperCase(), x, y, 8, helvBold, muted);
      draw(value || "—", x, y - 16, 11, helv, ink);
      page.drawLine({ start: { x, y: y - 24 }, end: { x: x + 225, y: y - 24 }, thickness: 0.5, color: line });
    };
    const y1 = height - 300;
    row("Bénéficiaire", (w as any).beneficiary ?? "", margin, y1);
    row("Banque bénéficiaire", (w as any).bank_name ?? "", margin + 270, y1);
    row("IBAN", (w as any).iban ?? "", margin, y1 - 62);
    row("BIC / SWIFT", (w as any).bic || "—", margin + 270, y1 - 62);
    row("Référence", ref, margin, y1 - 124);
    row("Date d'exécution", issued, margin + 270, y1 - 124);

    page.drawRectangle({ x: margin, y: 128, width: width - margin * 2, height: 62, color: rgb(1, 1, 1), borderColor: line, borderWidth: 1 });
    draw("Document généré par les systèmes sécurisés BNP PARIBAS.", margin + 16, 166, 9, helvBold, ink);
    draw("Ce justificatif fait foi de l'opération bancaire et peut être présenté à toute autorité compétente.", margin + 16, 150, 8.5, helv, muted);
    page.drawLine({ start: { x: margin, y: 82 }, end: { x: width - margin, y: 82 }, thickness: 0.5, color: line });
    draw("BNP PARIBAS France · 38 av. Kléber, 75116 Paris · SIREN 775 670 284", margin, 64, 8, helv, muted);
    draw(`Page 1 / 1 · ${ref}`, width - margin - 110, 64, 8, helv, muted);

    const bytes = await pdf.save();
    return { base64: Buffer.from(bytes).toString("base64"), filename: `justificatif-virement-bnpparibas-${ref}.pdf` };
  });
