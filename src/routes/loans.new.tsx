import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Upload, X, FileCheck2, ShieldCheck } from "lucide-react";
import { Honeypot } from "@/components/Honeypot";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import i18n from "@/i18n";

export const Route = createFileRoute("/loans/new")({
  component: NewLoan,
  head: () => ({ meta: [{ title: i18n.t("loanForm.title") + " — BNP PARIBAS" }] }),
});

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const REQUIRED_DOCS = 4;

function NewLoan() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [profileName, setProfileName] = useState("");

  const schema = z.object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(255),
    address: z.string().trim().min(5, t("loanForm.addressRequired")).max(255),
    amount: z.number().min(500, t("loanForm.amountMin")).max(100000, t("loanForm.amountMax")),
    duration_months: z.number().int().min(3).max(120),
    monthly_income: z.number().min(0).max(1000000),
    purpose: z.string().trim().max(500).optional(),
  });

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.full_name) setProfileName(data.full_name);
    })();
  }, [user]);

  function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    const valid = list.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(t("loanForm.fileTooLarge", { name: f.name }));
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...valid].slice(0, REQUIRED_DOCS));
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    // Anti-bot honeypot
    if (((fd.get("website") as string) || "").length) return;
    const parsed = schema.safeParse({
      fullName: fd.get("fullName"),
      email: fd.get("email"),
      address: fd.get("address"),
      amount: Number(fd.get("amount")),
      duration_months: Number(fd.get("duration_months")),
      monthly_income: Number(fd.get("monthly_income")),
      purpose: (fd.get("purpose") as string) || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (files.length !== REQUIRED_DOCS) {
      toast.error(t("loanForm.docsRequiredExact", { count: REQUIRED_DOCS }));
      return;
    }

    setSubmitting(true);


    const { data: loan, error: loanErr } = await supabase
      .from("loans")
      .insert({
        user_id: user.id,
        full_name: parsed.data.fullName,
        email: parsed.data.email,
        address: parsed.data.address,
        amount: parsed.data.amount,
        duration_months: parsed.data.duration_months,
        monthly_income: parsed.data.monthly_income,
        purpose: parsed.data.purpose ?? null,
      } as any)
      .select()
      .single();

    if (loanErr || !loan) {
      setSubmitting(false);
      toast.error(t("loanForm.createError"));
      return;
    }

    for (const file of files) {
      const safe = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const path = `${user.id}/${loan.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("loan-documents").upload(path, file);
      if (upErr) {
        toast.error(t("loanForm.uploadFailed", { name: file.name }));
        continue;
      }
      await supabase.from("loan_documents").insert({
        loan_id: loan.id,
        user_id: user.id,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
      });
    }

    const { notifyAllAdmins } = await import("@/lib/notifications");
    await notifyAllAdmins({
      titleKey: "notif.loan.newRequestAdminTitle",
      messageKey: "notif.loan.newRequestAdminMsg",
      params: {
        name: parsed.data.fullName,
        amount: parsed.data.amount,
        months: parsed.data.duration_months,
      },
      link: "/admin",
      category: "info",
    });

    setSubmitting(false);
    toast.success(t("loanForm.successToast"));
    navigate({ to: "/loans/$loanId", params: { loanId: loan.id } });
  }

  if (authLoading || !user) return <div className="flex items-center justify-center h-96 text-muted-foreground">{t("loanForm.loading")}</div>;

  const docs = [t("loanForm.doc1"), t("loanForm.doc2"), t("loanForm.doc3"), t("loanForm.doc4")];

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-8 sm:px-6 lg:px-8 lg:pb-10">
      <Button asChild variant="ghost" size="sm" className="mb-6 hidden sm:inline-flex">
        <Link to="/dashboard"><ArrowLeft className="mr-1.5 h-4 w-4" /> {t("loanForm.back")}</Link>
      </Button>

      <div className="mb-6 sm:hidden">
       <h1 className="text-2xl font-bold tracking-tight">{t("loanForm.newRequestShort")}</h1>
       <p className="mt-1 text-sm text-muted-foreground">{t("loanForm.newRequestDesc")}</p>
      </div>

      <div className="hidden sm:block">
       <h1 className="text-3xl font-bold">{t("loanForm.title")}</h1>
       <p className="mt-2 text-muted-foreground">{t("loanForm.subtitle")}</p>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileCheck2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">{t("loanForm.requiredDocs")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("loanForm.requiredDocsHint")}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          {docs.map((item) => (
            <div key={item} className="flex gap-2 rounded-xl bg-secondary px-3 py-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-card">
        <Honeypot />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">{t("loanForm.fullName")}</Label>
            <Input id="fullName" name="fullName" className="h-11" required defaultValue={profileName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("loanForm.email")}</Label>
            <Input id="email" name="email" type="email" className="h-11" required defaultValue={user.email ?? ""} />
          </div>
        </div>

        <AddressAutocomplete name="address" required label={t("loanForm.address")} />



        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="amount">{t("loanForm.amount")}</Label>
            <Input id="amount" name="amount" type="number" className="h-11" min={500} max={100000} step={100} required placeholder="5000" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duration_months">{t("loanForm.duration")}</Label>
            <Input id="duration_months" name="duration_months" type="number" className="h-11" min={3} max={120} required placeholder="24" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="monthly_income">{t("loanForm.monthlyIncome")}</Label>
          <Input id="monthly_income" name="monthly_income" type="number" className="h-11" min={0} step={50} required placeholder="2500" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="purpose">{t("loanForm.purpose")}</Label>
          <Textarea id="purpose" name="purpose" rows={4} className="min-h-[110px]" maxLength={500} placeholder={t("loanForm.purposePlaceholder")} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t("loanForm.documents")}</Label>
            <span className={`text-xs font-medium ${files.length === REQUIRED_DOCS ? "text-success" : "text-muted-foreground"}`}>
              {files.length}/{REQUIRED_DOCS}
            </span>
          </div>
          <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-input/30 px-4 py-7 text-sm text-muted-foreground cursor-pointer hover:bg-input/50 transition">
            <Upload className="h-4 w-4" />
            <span>{t("loanForm.uploadHintExact", { count: REQUIRED_DOCS })}</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              onChange={onFilesChange}
              className="hidden"
              disabled={files.length >= REQUIRED_DOCS}
            />
          </label>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded-md bg-secondary px-3 py-2 text-sm">
                  <span className="truncate">{f.name}</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button
          type="submit"
          className="h-11 w-full shadow-glow"
          size="lg"
          disabled={submitting || files.length !== REQUIRED_DOCS}
        >
          {submitting ? t("loanForm.submitting") : t("loanForm.submit")}
        </Button>
      </form>
    </div>
  );
}
