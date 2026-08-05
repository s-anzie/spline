"use client";

import { useState } from "react";

import { useSession } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignIn() {
  const { logIn, loading, error } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form
        className="w-full max-w-sm space-y-5 rounded-xl border p-8"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        onSubmit={(event) => {
          event.preventDefault();
          void logIn(email, password);
        }}
      >
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Spline</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            The console for a workspace and the machines that serve it.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {/*
          The hub's own message, never ours. Its refusals say what would have
          worked (§20.6) — "invalid credentials" would throw that away, and
          rate limiting says so plainly rather than looking like a wrong
          password.
        */}
        {error ? (
          <p className="text-sm" style={{ color: "var(--color-danger)" }} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
