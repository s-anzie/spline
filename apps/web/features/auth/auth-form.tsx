"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAuthStore } from "@/stores/auth-store";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pending = useAuthStore((state) => state.pending);
  const error = useAuthStore((state) => state.error);
  const token = useAuthStore((state) => state.token);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const clearError = useAuthStore((state) => state.clearError);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);
  useEffect(() => {
    const requestedPath = searchParams.get("next");
    const destination = requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/dashboard";
    if (token) router.replace(mode === "register" ? "/onboarding" : destination);
  }, [mode, router, searchParams, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const passwordConfirmation = String(data.get("passwordConfirmation") ?? "");
    if (mode === "register" && password !== passwordConfirmation) {
      useAuthStore.setState({ error: "Les mots de passe ne correspondent pas." });
      return;
    }
    try {
      if (mode === "register") await register(String(data.get("displayName") ?? ""), email, password);
      else await login(email, password);
    } catch {
      // Le store expose l'erreur du backend dans le formulaire.
    }
  }

  const registering = mode === "register";
  return <Card className="w-full max-w-sm border-white/[.08] bg-[#181614]">
    <CardHeader><CardTitle className="text-xl">{registering ? "Créer votre espace" : "Bon retour"}</CardTitle><p className="text-xs text-muted-foreground">{registering ? "Commencez à coordonner humains et agents." : "Connectez-vous à votre espace de pilotage."}</p></CardHeader>
    <CardContent><form className="grid gap-4" onSubmit={submit} aria-busy={pending}>
      {searchParams.get("expired") === "1" && <div role="status" className="rounded-lg border border-amber-400/15 bg-amber-400/[.06] p-3 text-[10px] leading-4 text-amber-100">Votre session a expiré. Reconnectez-vous pour reprendre là où vous étiez.</div>}
      <fieldset disabled={pending} className="contents">
      {registering && <label className="grid gap-1.5 text-xs">Nom complet<Input name="displayName" autoComplete="name" required placeholder="Bradley Martin" className="border-white/10 bg-white/[.025]"/></label>}
      <label className="grid gap-1.5 text-xs">Adresse e-mail<Input name="email" type="email" autoComplete="email" required placeholder="vous@entreprise.fr" className="border-white/10 bg-white/[.025]"/></label>
      <label className="grid gap-1.5 text-xs">Mot de passe<Input name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} minLength={8} required className="border-white/10 bg-white/[.025]"/></label>
      {registering && <label className="grid gap-1.5 text-xs">Confirmer le mot de passe<Input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={8} required className="border-white/10 bg-white/[.025]"/></label>}
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-400/15 bg-red-400/[.06] p-3 text-[10px] text-red-200"><AlertCircle className="mt-px size-3.5 shrink-0"/>{error}</div>}
      <LoadingButton type="submit" loading={pending} loadingText={registering ? "Création du compte…" : "Connexion…"} className="mt-2 min-w-44 bg-[#f47b64] text-[#241614] hover:bg-[#ff8b74]">{registering ? "Créer mon compte" : "Se connecter"}<ArrowRight/></LoadingButton>
      </fieldset>
      <p className="text-center text-[11px] text-muted-foreground">{registering ? "Déjà inscrit ? " : "Pas encore de compte ? "}<Link href={registering ? "/login" : "/register"} className="text-[#f39481] hover:text-[#ffad9d]">{registering ? "Se connecter" : "Créer un compte"}</Link></p>
    </form></CardContent>
  </Card>;
}
