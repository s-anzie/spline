import {
  Bell,
  Bot,
  CircleAlert,
  CircleGauge,
  Files,
  History,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  Network,
  Settings,
} from "lucide-react";

export const appNavigation = [
  { section: "Piloter", label: "Centre de contrôle", href: "/dashboard", icon: LayoutDashboard },
  { section: "Piloter", label: "À traiter", href: "/attention", icon: Bell },
  { section: "Organiser", label: "Workspaces", href: "/workspaces", icon: CircleGauge },
  { section: "Organiser", label: "Infrastructure", href: "/infrastructure", icon: Network },
];

export const workspaceNavigation = (workspaceId: string) => [
  {
    section: "Piloter",
    label: "Vue d’ensemble",
    href: `/workspaces/${workspaceId}`,
    icon: LayoutDashboard,
  },
  { section: "Piloter", label: "Plan de travail", href: `/workspaces/${workspaceId}/plan`, icon: ListTodo },
  {
    section: "Piloter",
    label: "Interventions",
    href: `/workspaces/${workspaceId}/attention`,
    icon: CircleAlert,
  },
  {
    section: "Collaborer",
    label: "Collaboration",
    href: `/workspaces/${workspaceId}/execution`,
    icon: MessagesSquare,
  },
  {
    section: "Collaborer",
    label: "Équipe",
    href: `/workspaces/${workspaceId}/agents`,
    icon: Bot,
  },
  {
    section: "Capitaliser",
    label: "Livrables",
    href: `/workspaces/${workspaceId}/artifacts`,
    icon: Files,
  },
  { section: "Capitaliser", label: "Activité", href: `/workspaces/${workspaceId}/activity`, icon: Bell },
  { section: "Capitaliser", label: "Historique", href: `/workspaces/${workspaceId}/history`, icon: History },
  {
    section: "Administrer",
    label: "Paramètres",
    href: `/workspaces/${workspaceId}/settings`,
    icon: Settings,
  },
];
