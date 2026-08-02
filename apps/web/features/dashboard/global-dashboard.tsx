"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  AlertTriangle,
  ArrowRight,
  FolderKanban,
  Plus,
  RefreshCw,
} from "lucide-react";

import { LatexContent } from "@/components/shared/latex-content";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  workspaceColor,
  workspaceInitials,
} from "@/lib/workspace-presentation";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function GlobalDashboard() {
  const { workspaces, loading, error, loadWorkspaces } = useWorkspaceStore();

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  return (
    <>
      <PageHeader
        eyebrow="Centre de contrôle · Tous workspaces"
        title="Où voulez-vous vous focaliser ?"
        description="Choisissez un seul contexte de travail ; les données détaillées seront chargées uniquement pour cet espace."
        actions={
          <>
            <LoadingButton
              loading={loading}
              onClick={() => void loadWorkspaces(true)}
              size="icon-lg"
              variant="outline"
            >
              <RefreshCw />
            </LoadingButton>
            <Button
              nativeButton={false}
              render={<Link href="/workspaces/new" />}
              variant="outline"
            >
              <Plus /> Nouveau workspace
            </Button>
          </>
        }
      />

      {error && (
        <Card className="mb-3 border-red-400/15 bg-red-400/[.04]">
          <CardContent className="flex gap-3 p-4 text-[10px] text-red-300">
            <AlertTriangle className="size-4" />
            {error}
          </CardContent>
        </Card>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-sm">Workspaces actifs</h2>
            <p className="text-[10px] text-muted-foreground">
              {workspaces.length} contexte(s) accessible(s)
            </p>
          </div>
          <Button
            nativeButton={false}
            render={<Link href="/workspaces" />}
            size="xs"
            variant="ghost"
          >
            Gérer <ArrowRight />
          </Button>
        </div>

        {workspaces.length > 0 && (
          <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {workspaces.map((workspace) => {
              const color = workspaceColor(workspace.id);

              return (
                <Card
                  key={workspace.id}
                  className="group h-56 overflow-hidden border-white/[.075] bg-white/[.018] transition duration-300 hover:-translate-y-0.5 hover:border-[#f47b64]/20 hover:bg-white/[.027] hover:shadow-[0_18px_55px_-32px_rgba(244,123,100,.35)]"
                >
                  <Link
                    href={`/workspaces/${workspace.id}`}
                    className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CardHeader className="flex-row items-start justify-between gap-3 pb-2">
                      <span
                        className="grid size-10 shrink-0 place-items-center rounded-xl text-xs font-semibold ring-1 ring-inset ring-white/[.045]"
                        style={{ backgroundColor: `${color}18`, color }}
                      >
                        {workspaceInitials(workspace.name)}
                      </span>
                      <Badge
                        variant="outline"
                        className="border-white/[.07] text-[9px]"
                      >
                        {workspace.status === "ACTIVE"
                          ? "Actif"
                          : workspace.status}
                      </Badge>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col pt-0">
                      <h3 className="truncate text-sm font-medium">
                        {workspace.name}
                      </h3>
                      <div className="relative mt-2 h-20 overflow-hidden">
                        {workspace.description ? (
                          <LatexContent
                            className="text-[9px] leading-4 [&_*]:text-[9px] [&_h1]:text-[11px] [&_h2]:text-[10px] [&_h3]:text-[10px] [&_p]:my-0"
                          >
                            {workspace.description}
                          </LatexContent>
                        ) : (
                          <p className="text-[9px] text-muted-foreground">
                            Aucune description
                          </p>
                        )}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[var(--card)] to-transparent" />
                      </div>
                      <div className="mt-auto flex items-center justify-end gap-1 text-[10px] text-muted-foreground transition-colors group-hover:text-[#f47b64]">
                        Ouvrir
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && workspaces.length === 0 && (
          <Card className="border-dashed border-white/[.075] bg-white/[.012]">
            <CardContent className="grid min-h-56 place-items-center text-center">
              <div>
                <FolderKanban className="mx-auto size-8 text-[#f47b64]" />
                <h2 className="mt-3 text-sm">Aucun workspace</h2>
                <Button
                  nativeButton={false}
                  render={<Link href="/workspaces/new" />}
                  className="mt-4 bg-[#f47b64] text-[#241614]"
                >
                  <Plus /> Créer le premier
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
