/**
 * Canonical slug derivation, shared by every entity that exposes a
 * URL-friendly name (Organization, Workspace, …). May return an empty
 * string — the caller decides whether that is an error.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
