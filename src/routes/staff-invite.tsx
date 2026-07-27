import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";
import { acceptStaffInvite } from "@/lib/staff.functions";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/staff-invite")({
  component: StaffInvitePage,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Activation de compte équipe — BNP PARIBAS" }] }),
});

function StaffInvitePage() {
  const { token } = useSearch({ from: "/staff-invite" });
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) { toast.error("Lien d'invitation invalide"); return; }
    if (!fullName.trim()) { toast.error("Nom complet requis"); return; }
    if (password.length < 10) { toast.error("Mot de passe : 10 caractères minimum"); return; }
    if (password !== confirm) { toast.error("Les mots de passe ne correspondent pas"); return; }
    setLoading(true);
    try {
      const res = await acceptStaffInvite({ data: { token, password, fullName: fullName.trim() } });
      setDone(res.email);
      toast.success("Compte activé — vous pouvez vous connecter");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'activation");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen grid place-items-center bg-muted/20 px-4">
        <Card className="max-w-md w-full">
          <CardHeader><CardTitle>Lien invalide</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ce lien d'invitation est incomplet. Contactez votre administrateur pour en recevoir un nouveau.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center bg-muted/20 px-4">
        <Card className="max-w-md w-full">
          <CardHeader><CardTitle>Compte activé</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Bienvenue dans l'équipe. Votre compte <span className="font-medium text-foreground">{done}</span> est prêt.
            </p>
            <Button className="w-full" onClick={() => navigate({ to: "/admin/verify", replace: true })}>
              Aller à la connexion équipe
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-muted/20 px-4 py-10">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="mt-3">Activer votre compte équipe</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Définissez votre mot de passe pour rejoindre l'espace équipe BNP PARIBAS.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="fullName">Nom complet</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe (10 car. min.)</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="confirm">Confirmation</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="mt-1.5" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Activation…</> : "Activer mon compte"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
