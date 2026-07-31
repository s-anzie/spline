import * as path from "node:path";

/**
 * Resolves `cwd` (absolute or relative) against `rootPath` and rejects any
 * result that escapes it (`..` traversal, or an absolute cwd outside root).
 * Returns the resolved absolute path, or null if it escapes the root.
 */
export function resolveCwdWithinRoot(rootPath: string, cwd: string): string | null {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedCwd = path.resolve(resolvedRoot, cwd);
  const relative = path.relative(resolvedRoot, resolvedCwd);

  if (relative === "") {
    return resolvedCwd;
  }
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return resolvedCwd;
}
