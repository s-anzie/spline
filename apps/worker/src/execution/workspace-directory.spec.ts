import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensureWorkspaceDirectory } from "./workspace-directory";

describe("ensureWorkspaceDirectory", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "spline-ws-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates the workspace's own directory under the root", () => {
    const directory = ensureWorkspaceDirectory(root, "w-1");

    expect(directory).toBe(join(root, "w-1"));
    expect(statSync(directory).isDirectory()).toBe(true);
  });

  it("creates the root too, so a fresh machine needs no preparation", () => {
    const directory = ensureWorkspaceDirectory(join(root, "deep", "nested"), "w-1");

    expect(statSync(directory).isDirectory()).toBe(true);
  });

  it("is idempotent: a second task in the same workspace is not a failure", () => {
    ensureWorkspaceDirectory(root, "w-1");

    expect(() => ensureWorkspaceDirectory(root, "w-1")).not.toThrow();
  });

  /** Owner-only: a workspace directory holds whatever an agent produced. */
  it("creates it readable by its owner and nobody else", () => {
    const directory = ensureWorkspaceDirectory(root, "w-1");

    expect(statSync(directory).mode & 0o777).toBe(0o700);
  });
});
