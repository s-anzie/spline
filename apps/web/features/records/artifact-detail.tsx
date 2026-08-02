"use client";

import Link from "next/link";
import { FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  GitBranch,
  Layers3,
  Link2,
  Save,
  Trash2,
  Unlink,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageHeader } from "@/components/shared/page-header";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";

export function ArtifactDetail({
  workspaceId,
  artifactId,
}: {
  workspaceId: string;
  artifactId: string;
}) {
  const router = useRouter();
  const {
    artifacts,
    loading,
    pendingAction,
    error,
    load,
    updateArtifact,
    artifactAction,
    deleteArtifact,
  } = useWorkspaceDomainStore();
  useEffect(() => {
    void load(workspaceId);
  }, [load, workspaceId]);
  const artifact = artifacts.find((item) => item.id === artifactId);
  if (loading)
    return (
      <div className="grid min-h-64 place-items-center text-xs text-muted-foreground">
        Chargement de l’artefact…
      </div>
    );
  if (!artifact)
    return (
      <Card>
        <CardContent className="p-6 text-xs">
          {error || "Artefact introuvable"}
        </CardContent>
      </Card>
    );
  async function metadata(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    try {
      await updateArtifact(artifactId, {
        name: String(d.get("name")),
        description: String(d.get("description")) || undefined,
        source: String(d.get("source")) || undefined,
      });
    } catch {
      /* Erreur affichée. */
    }
  }
  async function version(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    try {
      await artifactAction(artifactId, "versions", {
        contentRef: String(d.get("contentRef")) || undefined,
        checksum: String(d.get("checksum")) || undefined,
      });
      e.currentTarget.reset();
    } catch {
      /* Erreur affichée. */
    }
  }
  async function link(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    try {
      await artifactAction(artifactId, "link", {
        targetType: String(d.get("targetType")),
        targetId: String(d.get("targetId")),
      });
      e.currentTarget.reset();
    } catch {
      /* Erreur affichée. */
    }
  }
  const busy = pendingAction?.startsWith(`artifact:${artifactId}`) ?? false;
  return (
    <>
      <Button
        nativeButton={false}
        render={<Link href={`/workspaces/${workspaceId}/artifacts`} />}
        variant="ghost"
        size="sm"
        className="mb-5 text-muted-foreground"
      >
        <ArrowLeft />
        Artefacts
      </Button>
      <PageHeader
        eyebrow={`${artifact.type} · v${artifact.version}`}
        title={artifact.name}
        description={artifact.description || "Artefact versionné du workspace."}
        actions={
          <>
            <LoadingButton
              loading={pendingAction === `artifact:${artifactId}:archive`}
              onClick={() => void artifactAction(artifactId, "archive")}
              variant="outline"
            >
              <Archive />
              Archiver
            </LoadingButton>
            <LoadingButton
              loading={pendingAction === `artifact:${artifactId}:delete`}
              onClick={async () => {
                try {
                  await deleteArtifact(artifactId);
                  router.push(`/workspaces/${workspaceId}/artifacts`);
                } catch {
                  /* L'erreur du store reste affichée. */
                }
              }}
              variant="destructive"
            >
              <Trash2 />
              Supprimer
            </LoadingButton>
          </>
        }
      />
      <div className="grid gap-3 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="border-white/[.075] bg-white/[.018]">
          <CardHeader>
            <h2 className="text-sm">Métadonnées</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={metadata} className="grid gap-4">
              <fieldset disabled={busy} className="contents">
                <label className="grid gap-2 text-xs">
                  Nom
                  <Input name="name" defaultValue={artifact.name} required />
                </label>
                <label className="grid gap-2 text-xs">
                  Description
                  <textarea
                    name="description"
                    defaultValue={artifact.description ?? ""}
                    className="min-h-24 rounded-lg border border-white/10 bg-white/[.025] p-3 outline-none"
                  />
                </label>
                <label className="grid gap-2 text-xs">
                  Source
                  <Input name="source" defaultValue={artifact.source ?? ""} />
                </label>
                <div className="flex gap-2">
                  <Badge variant="outline">{artifact.status}</Badge>
                  <Badge variant="outline">
                    checksum {artifact.checksum || "—"}
                  </Badge>
                </div>
                <LoadingButton
                  type="submit"
                  loading={pendingAction === `artifact:${artifactId}:update`}
                  className="w-fit"
                >
                  <Save />
                  Enregistrer
                </LoadingButton>
              </fieldset>
            </form>
          </CardContent>
        </Card>
        <div className="grid gap-3">
          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Layers3 className="size-4 text-[#f47b64]" />
                <h2 className="text-sm">Nouvelle version</h2>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={version} className="grid gap-3">
                <Input name="contentRef" placeholder="Référence du contenu" />
                <Input name="checksum" placeholder="Checksum" />
                <LoadingButton
                  type="submit"
                  loading={pendingAction === `artifact:${artifactId}:versions`}
                >
                  <Upload />
                  Versionner
                </LoadingButton>
              </form>
              <div className="mt-4 grid gap-2">
                {artifact.versions.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-white/[.05] p-2 text-[9px]"
                  >
                    v{index + 1} · {JSON.stringify(item)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <GitBranch className="size-4 text-[#f47b64]" />
                <h2 className="text-sm">Liaisons</h2>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={link} className="grid gap-2">
                <select
                  name="targetType"
                  className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3 text-xs"
                >
                  <option value="goal">Objectif</option>
                  <option value="task">Tâche</option>
                  <option value="decision">Décision</option>
                  <option value="process">Process</option>
                </select>
                <Input
                  name="targetId"
                  required
                  placeholder="Identifiant de la cible"
                />
                <LoadingButton
                  type="submit"
                  loading={pendingAction === `artifact:${artifactId}:link`}
                >
                  <Link2 />
                  Lier
                </LoadingButton>
              </form>
              <div className="mt-3 grid gap-2">
                {(["goal", "task", "decision", "process"] as const).map(
                  (type) => {
                    const id =
                      artifact[
                        `${type}Id` as
                          "goalId" | "taskId" | "decisionId" | "processId"
                      ];
                    return (
                      id && (
                        <div
                          key={type}
                          className="flex items-center gap-2 rounded-lg border border-white/[.05] p-2 text-[9px]"
                        >
                          <span className="flex-1 truncate">
                            {type} · {id}
                          </span>
                          <LoadingButton
                            loading={
                              pendingAction === `artifact:${artifactId}:unlink`
                            }
                            onClick={() =>
                              void artifactAction(artifactId, "unlink", {
                                targetType: type,
                              })
                            }
                            size="icon-xs"
                            variant="ghost"
                          >
                            <Unlink />
                          </LoadingButton>
                        </div>
                      )
                    );
                  },
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {error && <p className="mt-4 text-[10px] text-red-300">{error}</p>}
    </>
  );
}
