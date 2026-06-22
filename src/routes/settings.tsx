import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { PasswordStrength } from "@/components/PasswordStrength";
import { Honeypot } from "@/components/Honeypot";
import { isPasswordStrong } from "@/lib/password";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, User as UserIcon, Mail, Phone, ShieldCheck, Loader2 } from "lucide-react";
import i18n from "@/i18n";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: i18n.t("settings.metaTitle") }] }),
});

function SettingsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  async function loadProfile() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, phone, email")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      toast.error(t("settings.loadProfileError"));
    } else if (data) {
      setFullName(data.full_name ?? "");
      setPhone(data.phone ?? "");
      setEmail(data.email ?? user.email ?? "");
      setNewEmail(data.email ?? user.email ?? "");
    }
    setLoading(false);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), phone: phone.trim() })
      .eq("user_id", user.id);
    setSavingProfile(false);
    if (error) toast.error(t("settings.saveError"));
    else toast.success(t("settings.profileUpdated"));
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim() || newEmail === email) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setSavingEmail(false);
    if (error) toast.error(error.message);
    else toast.success(t("settings.emailUpdated"));
  }

  async function handleChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (((new FormData(e.currentTarget).get("website") as string) || "").length) return;
    if (!isPasswordStrong(newPassword)) {
      toast.error(t("password.notStrong"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("settings.passwordMismatch"));
      return;
    }
    setSavingPassword(true);
    if (currentPassword && user?.email) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInErr) {
        setSavingPassword(false);
        toast.error(t("settings.currentPasswordWrong"));
        return;
      }
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) toast.error(error.message);
    else {
      toast.success(t("settings.passwordUpdated"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:pb-12 sm:pt-10">
      <div className="mb-6 flex items-center gap-3 hidden sm:flex">
        <Button asChild variant="ghost" size="icon">
          <Link to={role === "admin" ? "/admin" : "/dashboard"}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("settings.subtitleDesktop")}</p>
        </div>
      </div>
      <div className="mb-6 sm:hidden">
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.subtitleMobile")}</p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold tracking-tight">{t("settings.profile")}</h2>
        </div>
        <form onSubmit={handleSaveProfile} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="fullName">{t("settings.fullName")}</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1.5 h-11" required />
          </div>
          <div>
            <Label htmlFor="phone">
              <Phone className="mr-1 inline h-3.5 w-3.5" /> {t("settings.phone")}
            </Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5 h-11" placeholder="+44 7529 529674" />
          </div>
          <div>
            <Label>{t("settings.currentEmail")}</Label>
            <Input value={email} disabled className="mt-1.5 h-11 bg-muted/40" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={savingProfile} className="w-full sm:w-auto">
              {savingProfile ? t("common.saving") : t("settings.saveProfile")}
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">{t("settings.emailSection")}</h2>
        </div>
        <form onSubmit={handleChangeEmail} className="space-y-4">
          <div>
            <Label htmlFor="newEmail">{t("settings.newEmail")}</Label>
            <Input
              id="newEmail"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="mt-1.5 h-11"
              required
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{t("settings.emailHint")}</p>
          </div>
          <Button type="submit" disabled={savingEmail || newEmail === email} className="w-full sm:w-auto" variant="secondary">
            {savingEmail ? t("common.sending") : t("settings.updateEmail")}
          </Button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">{t("settings.passwordSection")}</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Honeypot />
          <div>
            <Label htmlFor="currentPassword">{t("settings.currentPassword")}</Label>
            <PasswordInput
              id="currentPassword"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.currentTarget.value)}
              className="mt-1.5 h-11"
              autoComplete="current-password"
              required
              showToggleLabel={{ show: t("password.show"), hide: t("password.hide") }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="newPassword">{t("settings.newPassword")}</Label>
              <PasswordInput
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.currentTarget.value)}
                className="mt-1.5 h-11"
                minLength={10}
                autoComplete="new-password"
                required
                showToggleLabel={{ show: t("password.show"), hide: t("password.hide") }}
              />
              <PasswordStrength password={newPassword} />
            </div>
            <div>
              <Label htmlFor="confirmPassword">{t("settings.confirmPassword")}</Label>
              <PasswordInput
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.currentTarget.value)}
                className="mt-1.5 h-11"
                minLength={10}
                autoComplete="new-password"
                required
                showToggleLabel={{ show: t("password.show"), hide: t("password.hide") }}
              />
            </div>
          </div>
          <Button type="submit" disabled={savingPassword || !isPasswordStrong(newPassword)} className="w-full sm:w-auto">
            {savingPassword ? t("common.updating") : t("settings.changePassword")}
          </Button>
        </form>
      </section>

      {role === "admin" && (
        <section className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">{t("settings.adminAccount")}</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("settings.adminDesc")}</p>
          <Button asChild variant="outline" className="mt-4 w-full sm:w-auto">
            <Link to="/admin">{t("settings.accessAdmin")}</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
