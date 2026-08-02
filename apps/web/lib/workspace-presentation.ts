export function workspaceInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "WS";
}

const workspaceColors = ["#f47b64", "#aa91ec", "#60bec5", "#e9ad5b", "#75c58c"];

export function workspaceColor(id: string) {
  const hash = Array.from(id).reduce((total, char) => total + char.charCodeAt(0), 0);
  return workspaceColors[hash % workspaceColors.length] ?? workspaceColors[0]!;
}
