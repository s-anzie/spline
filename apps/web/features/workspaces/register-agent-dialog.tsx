"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Eye,
  Plus,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { cn } from "@/lib/utils";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";

type AgentRole = "AGENT_MANAGER" | "AGENT_CONTRIBUTOR" | "READ_ONLY_AGENT";
type Capability = {
  id: string;
  label: string;
  description: string;
  group: string;
};

const roleOptions: Array<{
  id: AgentRole;
  label: string;
  description: string;
  icon: typeof UsersRound;
}> = [
  {
    id: "AGENT_MANAGER",
    label: "Manager",
    description:
      "Coordonne, délègue et supervise le travail des autres agents.",
    icon: UsersRound,
  },
  {
    id: "AGENT_CONTRIBUTOR",
    label: "Contributeur",
    description: "Exécute les tâches et produit directement des livrables.",
    icon: Code2,
  },
  {
    id: "READ_ONLY_AGENT",
    label: "Observateur",
    description: "Analyse et synthétise sans modifier le workspace.",
    icon: Eye,
  },
];

const capabilitiesByRole: Record<AgentRole, Capability[]> = {
  AGENT_MANAGER: [
    {
      id: "plan_work",
      label: "Planifier",
      description: "Décomposer objectifs et étapes",
      group: "Coordination",
    },
    {
      id: "delegate_tasks",
      label: "Déléguer",
      description: "Distribuer le travail aux agents",
      group: "Coordination",
    },
    {
      id: "supervise_agents",
      label: "Superviser",
      description: "Suivre agents et sessions",
      group: "Coordination",
    },
    {
      id: "review_changes",
      label: "Réviser",
      description: "Contrôler les changements produits",
      group: "Qualité",
    },
    {
      id: "validate_outputs",
      label: "Valider",
      description: "Approuver les résultats",
      group: "Qualité",
    },
    {
      id: "report_progress",
      label: "Rapporter",
      description: "Synthétiser l’avancement",
      group: "Qualité",
    },
  ],
  AGENT_CONTRIBUTOR: [
    {
      id: "code_edit",
      label: "Modifier le code",
      description: "Créer et éditer des fichiers",
      group: "Développement",
    },
    {
      id: "shell_exec",
      label: "Terminal",
      description: "Exécuter des commandes",
      group: "Développement",
    },
    {
      id: "run_tests",
      label: "Tests",
      description: "Lancer et analyser les tests",
      group: "Développement",
    },
    {
      id: "execute_tasks",
      label: "Exécuter des tâches",
      description: "Prendre en charge le travail assigné",
      group: "Exécution",
    },
    {
      id: "manage_processes",
      label: "Processus",
      description: "Piloter les processus runtime",
      group: "Exécution",
    },
    {
      id: "create_artifacts",
      label: "Artefacts",
      description: "Produire et versionner des livrables",
      group: "Exécution",
    },
  ],
  READ_ONLY_AGENT: [
    {
      id: "read_workspace",
      label: "Lire le workspace",
      description: "Consulter objectifs et tâches",
      group: "Consultation",
    },
    {
      id: "inspect_artifacts",
      label: "Inspecter les artefacts",
      description: "Lire les livrables et versions",
      group: "Consultation",
    },
    {
      id: "analyze_code",
      label: "Analyser le code",
      description: "Étudier sans modifier",
      group: "Analyse",
    },
    {
      id: "summarize",
      label: "Synthétiser",
      description: "Produire résumés et rapports",
      group: "Analyse",
    },
  ],
};

const defaultsByRole: Record<AgentRole, string[]> = {
  AGENT_MANAGER: [
    "plan_work",
    "delegate_tasks",
    "supervise_agents",
    "report_progress",
  ],
  AGENT_CONTRIBUTOR: ["code_edit", "shell_exec", "run_tests", "execute_tasks"],
  READ_ONLY_AGENT: [
    "read_workspace",
    "inspect_artifacts",
    "analyze_code",
    "summarize",
  ],
};

export function RegisterAgentDialog() {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<AgentRole>("AGENT_CONTRIBUTOR");
  const [provider, setProvider] = useState("");
  const [selected, setSelected] = useState<string[]>(
    defaultsByRole.AGENT_CONTRIBUTOR,
  );
  const providers = useWorkspaceDomainStore((state) => state.providers);
  const register = useWorkspaceDomainStore((state) => state.registerAgent);
  const pending =
    useWorkspaceDomainStore((state) => state.pendingAction) ===
    "agent:register";
  const error = useWorkspaceDomainStore((state) => state.error);
  const activeProvider =
    provider || providers.find((item) => item.available)?.provider || "";

  const capabilities = useMemo(() => {
    const base = capabilitiesByRole[role];
    const providerCapabilities = providers.find(
      (item) => item.provider === activeProvider,
    )?.capabilities;
    if (!Array.isArray(providerCapabilities)) return base;
    const known = new Set(base.map((item) => item.id));
    return [
      ...base,
      ...providerCapabilities
        .filter(
          (item): item is string =>
            typeof item === "string" && !known.has(item),
        )
        .map((id) => ({
          id,
          label: id.replaceAll("_", " "),
          description: `Capacité native ${activeProvider}`,
          group: "Provider",
        })),
    ];
  }, [activeProvider, providers, role]);

  const groups = useMemo(
    () => [...new Set(capabilities.map((capability) => capability.group))],
    [capabilities],
  );

  function chooseRole(nextRole: AgentRole) {
    setRole(nextRole);
    setSelected(defaultsByRole[nextRole]);
  }
  function toggleCapability(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((capability) => capability !== id)
        : [...current, id],
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const agent = await register({
        displayName: String(data.get("displayName")),
        provider: activeProvider,
        role,
        capabilities: selected,
      });
      setToken(agent.token);
    } catch {
      /* Erreur affichée par le store. */
    }
  }
  function handleOpen(open: boolean) {
    if (open) return;
    setToken(null);
    setRole("AGENT_CONTRIBUTOR");
    setSelected(defaultsByRole.AGENT_CONTRIBUTOR);
    setProvider("");
  }

  return (
    <Dialog onOpenChange={handleOpen}>
      <DialogTrigger
        render={<Button className="bg-[#f47b64] text-[#241614]" />}
      >
        <Plus />
        Ajouter un agent
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#191715] p-6 text-foreground sm:max-w-2xl">
        <DialogHeader>
          <span className="mb-2 grid size-9 place-items-center rounded-lg bg-[#f47b64]/10 text-[#f47b64]">
            <Bot />
          </span>
          <DialogTitle>
            {token ? "Agent enregistré" : "Enregistrer un agent"}
          </DialogTitle>
          <DialogDescription>
            {token
              ? "Conservez maintenant ce secret : il ne sera plus affiché."
              : "Choisissez d’abord sa responsabilité, puis ajustez uniquement les capacités utiles."}
          </DialogDescription>
        </DialogHeader>
        {token ? (
          <div className="grid gap-4 py-5">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-400/10 text-emerald-400">
              <Check />
            </span>
            <div className="rounded-lg border border-amber-400/15 p-3">
              <code className="break-all text-[9px]">{token}</code>
              <Button
                onClick={() => void navigator.clipboard.writeText(token)}
                size="sm"
                variant="ghost"
                className="mt-2 w-full"
              >
                <Copy />
                Copier le token
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-5">
            <fieldset disabled={pending} className="contents">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-xs">
                  Nom
                  <Input
                    name="displayName"
                    required
                    placeholder="Ex. Agent backend"
                  />
                </label>
                <label className="grid gap-2 text-xs">
                  Provider
                  <select
                    value={activeProvider}
                    onChange={(event) => setProvider(event.target.value)}
                    required
                    className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3"
                  >
                    {providers.filter((item) => item.available).map((item) => (
                      <option key={item.id} value={item.provider}>
                        {item.provider}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <section>
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck className="size-4 text-[#f47b64]" />
                  <div>
                    <h3 className="text-xs font-medium">
                      Quel rôle doit-il tenir ?
                    </h3>
                    <p className="text-[8px] text-muted-foreground">
                      Le rôle définit ses permissions structurelles dans le
                      workspace.
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {roleOptions.map((option) => {
                    const Icon = option.icon;
                    const active = role === option.id;
                    return (
                      <button
                        type="button"
                        key={option.id}
                        onClick={() => chooseRole(option.id)}
                        className={cn(
                          "relative rounded-xl border p-3 text-left transition-all",
                          active
                            ? "border-[#f47b64]/35 bg-[#f47b64]/[.075] shadow-[0_8px_25px_-18px_rgba(244,123,100,.8)]"
                            : "border-white/[.065] bg-white/[.012] hover:border-white/15 hover:bg-white/[.025]",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4",
                            active ? "text-[#f47b64]" : "text-muted-foreground",
                          )}
                        />
                        <strong className="mt-3 block text-[10px]">
                          {option.label}
                        </strong>
                        <span className="mt-1 block text-[8px] leading-3 text-muted-foreground">
                          {option.description}
                        </span>
                        {active && (
                          <CheckCircle2 className="absolute right-2.5 top-2.5 size-3.5 text-[#f47b64]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-xl border border-white/[.06] bg-white/[.012] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="size-4 text-[#f47b64]" />
                    <div>
                      <h3 className="text-xs font-medium">Capacités du rôle</h3>
                      <p className="text-[8px] text-muted-foreground">
                        Une sélection recommandée est déjà appliquée.
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {selected.length} sélectionnée
                    {selected.length > 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="grid gap-4">
                  {groups.map((group) => (
                    <div key={group}>
                      <p className="mb-2 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[.14em] text-[#625e5a]">
                        {group === "Développement" ? (
                          <Code2 className="size-3" />
                        ) : group === "Provider" ? (
                          <Sparkles className="size-3" />
                        ) : (
                          <Wrench className="size-3" />
                        )}
                        {group}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {capabilities
                          .filter((capability) => capability.group === group)
                          .map((capability) => {
                            const active = selected.includes(capability.id);
                            return (
                              <button
                                type="button"
                                key={capability.id}
                                aria-pressed={active}
                                onClick={() => toggleCapability(capability.id)}
                                className={cn(
                                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                                  active
                                    ? "border-[#f47b64]/25 bg-[#f47b64]/[.055]"
                                    : "border-white/[.055] hover:bg-white/[.025]",
                                )}
                              >
                                <span
                                  className={cn(
                                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                                    active
                                      ? "border-[#f47b64] bg-[#f47b64] text-[#241614]"
                                      : "border-white/15",
                                  )}
                                >
                                  {active && <Check className="size-3" />}
                                </span>
                                <span>
                                  <strong className="block text-[9px] font-medium">
                                    {capability.label}
                                  </strong>
                                  <small className="mt-0.5 block text-[8px] leading-3 text-muted-foreground">
                                    {capability.description}
                                  </small>
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {error && <p className="text-[10px] text-red-300">{error}</p>}
              <LoadingButton
                type="submit"
                loading={pending}
                loadingText="Enregistrement…"
                disabled={!activeProvider || !selected.length}
                className="bg-[#f47b64] text-[#241614]"
              >
                Enregistrer et générer le token
              </LoadingButton>
            </fieldset>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
