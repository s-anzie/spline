"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { usePlanningStore } from "@/stores/planning-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const resetWorkspaces = useWorkspaceStore((state) => state.reset);
  const resetPlanning = usePlanningStore((state) => state.reset);
  const resetDomains = useWorkspaceDomainStore((state) => state.reset);

  useEffect(() => {
    const expireSession = () => {
      resetWorkspaces();
      resetPlanning();
      resetDomains();
      logout();
      router.replace(`/login?expired=1&next=${encodeURIComponent(pathname)}`);
    };
    window.addEventListener("spline:unauthorized", expireSession);
    return () => window.removeEventListener("spline:unauthorized", expireSession);
  }, [logout, pathname, resetDomains, resetPlanning, resetWorkspaces, router]);

  useEffect(() => {
    if (hydrated && !token) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [hydrated, pathname, router, token]);

  if (!hydrated || !token) {
    return <div className="dark grid min-h-screen place-items-center bg-[#11100f] text-[#f2efea]">
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="size-4 animate-spin rounded-full border-2 border-white/10 border-t-[#f47b64]"/>Vérification de la session…</div>
    </div>;
  }

  return children;
}
