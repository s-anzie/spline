import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unwatchFile,
  watchFile,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface RuntimeConfig {
  hubUrl: string;
  machineToken?: string;
  agentTokens?: Record<string, string>;
}

export function runtimeConfigPath(): string {
  return (
    process.env["SPLINE_RUNTIME_CONFIG"] ??
    join(
      process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config"),
      "spline",
      "runtime.json",
    )
  );
}

export function readRuntimeConfig(): RuntimeConfig {
  const path = runtimeConfigPath();
  let stored: Partial<RuntimeConfig> = {};
  if (existsSync(path)) {
    try {
      stored = JSON.parse(readFileSync(path, "utf8")) as Partial<RuntimeConfig>;
    } catch (error) {
      throw new Error(
        `Invalid runtime config at ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return {
    hubUrl: process.env["HUB_URL"] ?? stored.hubUrl ?? "http://localhost:8765",
    machineToken: process.env["MACHINE_TOKEN"] ?? stored.machineToken,
    agentTokens: stored.agentTokens ?? {},
  };
}

export function writeRuntimeConfig(config: RuntimeConfig): void {
  const path = runtimeConfigPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporary, path);
}

export function watchRuntimeConfig(onChange: () => void): () => void {
  const path = runtimeConfigPath();
  watchFile(path, { interval: 1000 }, (current, previous) => {
    if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size)
      onChange();
  });
  return () => unwatchFile(path);
}
