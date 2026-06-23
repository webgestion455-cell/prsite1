import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PasswordInput } from "@/components/PasswordInput";
import { PasswordStrength } from "@/components/PasswordStrength";
import { Honeypot } from "@/components/Honeypot";
import { isPasswordStrong } from "@/lib/password";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, Lock, Sparkles, Loader2 } from "lucide-react";
import bnpparibasLogo from "@/assets/bnpparibas-logo.png";
import i18n from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [{ title: "BNP PARIBAS" }],
  }),
});

function AuthPage() {
  const { t } = useTranslation();
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [signupPw, setSignupPw] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const formStartRef = useRef<number>(Date.now());

  const signUpSchema = z.object({
    fullName: z.string().trim().min(2, t("auth.nameShort")).max(100),
    phone: z.string().trim().min(6, t("auth.phoneInvalid")).max(20),
    email: z.string().trim().email(t("auth.emailInvalid")).max(255),
    password: z.string().min(10, t("password.notStrong")).max(72),
  });

  const signInSchema = z.object({
    email: z.string().trim().email(t("auth.emailInvalid")).max(255),
    password: z.string().min(1, t("auth.passwordRequired")).max(72),
  });

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  function isBotSubmission(form: HTMLFormElement): boolean {
    const fd = new FormData(form);
    if ((fd.get("website") as string)?.length) return true;
    // Sub-second submissions are almost always bots
    if (Date.now() - formStartRef.current < 800) return true;
    return false;
  }

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isBotSubmission(e.currentTarget)) return;
    const fd = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const { error } = await signIn(parsed.data.email, parsed.data.password);
    setSubmitting(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials" ? t("auth.invalidCredentials") : error.message);
    } else {
      toast.success(t("auth.connectedToast"));
      navigate({ to: "/dashboard" });
    }
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isBotSubmission(e.currentTarget)) return;
    const fd = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse({
      fullName: fd.get("fullName"),
      phone: fd.get("phone"),
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (!isPasswordStrong(parsed.data.password)) {
      toast.error(t("password.notStrong"));
      return;
    }
    setSubmitting(true);
    const lang = i18n.language || navigator.language?.split("-")[0] || "fr";
    const { error } = await signUp(parsed.data.email, parsed.data.password, parsed.data.fullName, parsed.data.phone, lang);
    setSubmitting(false);
    if (error) {
      if (error.message.includes("already registered")) {
        toast.error(t("auth.emailAlreadyUsed"));
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success(t("auth.accountCreated"));
      navigate({ to: "/auth-pending" });
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    setGoogleLoading(false);
    if (error) toast.error(t("auth.googleError"));
  }

  async function handleForgot() {
    const email = forgotEmail.trim();
    const ok = z.string().email().safeParse(email).success;
    if (!ok) {
      toast.error(t("auth.emailInvalid"));
      return;
    }
    setForgotSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.forgotSent"));
    setForgotOpen(false);
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-hero px-4 py-12">
      <div className="grid w-full max-w-5xl gap-10 lg:grid-cols-[1fr_440px]">
        {/* Left side – brand promise */}
        <div className="hidden flex-col justify-center lg:flex">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3 w-3 text-accent" /> {t("auth.brandBadge")}
          </div>
          <h1 className="mt-6 font-serif text-5xl font-medium leading-[1.05] tracking-tight">
            {t("auth.welcomeTitle")}<br /><span className="text-gradient">BNP PARIBAS</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">{t("auth.welcomeDesc")}</p>
          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-center gap-3"><Lock className="h-4 w-4 text-accent" /> {t("auth.tls")}</li>
            <li className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-accent" /> {t("auth.rgpd")}</li>
            <li className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-accent" /> {t("auth.decision")}</li>
          </ul>
        </div>

        <div>
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-primary shadow-glow">
              <img src={bnpparibasLogo} alt="BNP PARIBAS" width={22} height={22}
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-md object-contain bg-white p-0.5 shadow-sm shrink-0" />
            </div>
            <h1 className="font-serif text-3xl font-medium">BNP PARIBAS</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("auth.mobileHint")}</p>
          </div>

          <Button asChild variant="ghost" size="sm" className="mb-4">
            <Link to="/"><ArrowLeft className="mr-2 h-4 w-4" /> {t("auth.backHome")}</Link>
          </Button>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-elevated md:p-8">
            <Button type="button" variant="outline" className="mb-4 h-11 w-full" disabled={googleLoading} onClick={handleGoogleSignIn}>
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-xs font-bold">G</span>
              {googleLoading ? t("auth.googleLoading") : t("auth.google")}
            </Button>
            <Tabs defaultValue="signin" onValueChange={() => (formStartRef.current = Date.now())}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">{t("auth.tabSignin")}</TabsTrigger>
                <TabsTrigger value="signup">{t("auth.tabSignup")}</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="mt-4 space-y-4">
                  <Honeypot />
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">{t("auth.emailLabel")}</Label>
                    <Input id="signin-email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="signin-password">{t("auth.passwordLabel")}</Label>
                      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
                        <DialogTrigger asChild>
                          <button type="button" className="text-xs font-medium text-primary hover:underline">
                            {t("auth.forgotLink")}
                          </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>{t("auth.forgotTitle")}</DialogTitle>
                            <DialogDescription>{t("auth.forgotDesc")}</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-2">
                            <Label htmlFor="fp-email">{t("auth.emailLabel")}</Label>
                            <Input
                              id="fp-email"
                              type="email"
                              autoComplete="email"
                              value={forgotEmail}
                              onChange={(e) => setForgotEmail(e.target.value)}
                            />
                          </div>
                          <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setForgotOpen(false)}>{t("common.cancel")}</Button>
                            <Button type="button" onClick={handleForgot} disabled={forgotSending}>
                              {forgotSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              {t("auth.forgotSend")}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <PasswordInput id="signin-password" name="password" required autoComplete="current-password"
                      showToggleLabel={{ show: t("password.show"), hide: t("password.hide") }} />
                  </div>
                  <Button type="submit" className="h-11 w-full shadow-glow" disabled={submitting}>
                    {submitting ? t("auth.signingIn") : t("auth.signIn")}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="mt-4 space-y-4">
                  <Honeypot />
                  <div className="space-y-2">
                    <Label htmlFor="su-fullname">{t("auth.fullNameLabel")}</Label>
                    <Input id="su-fullname" name="fullName" required autoComplete="name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-phone">{t("auth.phoneLabel")}</Label>
                    <Input id="su-phone" name="phone" type="tel" required autoComplete="tel" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">{t("auth.emailLabel")}</Label>
                    <Input id="su-email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-password">{t("auth.passwordLabel")}</Label>
                    <PasswordInput
                      id="su-password"
                      name="password"
                      required
                      autoComplete="new-password"
                      minLength={10}
                      value={signupPw}
                      onChange={(e) => setSignupPw(e.currentTarget.value)}
                      showToggleLabel={{ show: t("password.show"), hide: t("password.hide") }}
                    />
                    <PasswordStrength password={signupPw} />
                  </div>
                  <Button type="submit" className="h-11 w-full shadow-glow" disabled={submitting || !isPasswordStrong(signupPw)}>
                    {submitting ? t("auth.creating") : t("auth.createAccount")}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">{t("auth.terms")}</p>
        </div>
      </div>
    </div>
  );
}
