import {
  Bell,
  Bot,
  CircleGauge,
  ClipboardCheck,
  Files,
  History,
  LayoutDashboard,
  ListTodo,
  Network,
  PlayCircle,
  Settings,
} from "lucide-react";

export const appNavigation = [
  { label: "Centre de contrôle", href: "/dashboard", icon: LayoutDashboard },
  { label: "À traiter", href: "/attention", icon: Bell },
  { label: "Workspaces", href: "/workspaces", icon: CircleGauge },
  { label: "Infrastructure", href: "/infrastructure", icon: Network },
];

export const workspaceNavigation = (workspaceId: string) => [
  {
    label: "Accueil",
    href: `/workspaces/${workspaceId}`,
    icon: LayoutDashboard,
  },
  { label: "Travail", href: `/workspaces/${workspaceId}/plan`, icon: ListTodo },
  {
    label: "Conversations",
    href: `/workspaces/${workspaceId}/execution`,
    icon: PlayCircle,
  },
  { label: "Équipe", href: `/workspaces/${workspaceId}/agents`, icon: Bot },
  {
    label: "Fichiers",
    href: `/workspaces/${workspaceId}/artifacts`,
    icon: Files,
  },
  {
    label: "À valider",
    href: `/workspaces/${workspaceId}/review`,
    icon: ClipboardCheck,
  },
  {
    label: "Actualité",
    href: `/workspaces/${workspaceId}/activity`,
    icon: Bell,
  },
  {
    label: "Journal",
    href: `/workspaces/${workspaceId}/history`,
    icon: History,
  },
  {
    label: "Paramètres",
    href: `/workspaces/${workspaceId}/settings`,
    icon: Settings,
  },
];
