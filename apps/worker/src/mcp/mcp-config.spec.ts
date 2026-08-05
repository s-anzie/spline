import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SERVER_NAME, writeMcpBridge } from "./mcp-config";

const TOKEN = "grant_abc.a-real-looking-secret";

describe("writeMcpBridge", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "spline-mcp-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function written() {
    return writeMcpBridge({
      directory,
      hubUrl: "http://localhost:8765",
      workspaceId: "w-1",
      taskId: "t-1",
      grantToken: TOKEN,
      serverCommand: "node",
      serverArgs: ["dist/mcp/server.js"],
    });
  }

  it("declares the server the agent will spawn", () => {
    const surface = written();
    const config = JSON.parse(readFileSync(surface.mcpConfigPath!, "utf8"));

    expect(config.mcpServers[SERVER_NAME].command).toBe("node");
    expect(config.mcpServers[SERVER_NAME].args).toEqual(["dist/mcp/server.js"]);
  });

  it("allows exactly the protocol's tools and nothing else", () => {
    const surface = written();

    expect(surface.allowedTools.length).toBeGreaterThan(0);
    expect(surface.allowedTools.every((name) => name.startsWith("mcp__spline__"))).toBe(
      true,
    );
  });

  /**
   * §18.4 — the properties this file exists for, and all three are negative.
   */
  describe("where the credential is not", () => {
    /**
     * `--mcp-config` accepts a JSON string, which would put the token in the
     * CLI's argv — readable in `ps` by every account on the machine. The
     * surface carries a PATH, and its type has no field that could carry the
     * config inline.
     */
    it("is not in what gets passed on the command line", () => {
      const surface = written();

      expect(surface.mcpConfigPath).toMatch(/\.spline\/mcp\.json$/);
      expect(JSON.stringify(surface)).not.toContain(TOKEN);
    });

    /**
     * It lives in the env of the server the AGENT spawns, not in the agent's
     * own. An agent that found a way to read its environment would find
     * nothing: it can use the credential through the tools, never see it.
     */
    it("is in the server's environment, which the agent does not share", () => {
      const surface = written();
      const config = JSON.parse(readFileSync(surface.mcpConfigPath!, "utf8"));

      expect(config.mcpServers[SERVER_NAME].env.SPLINE_GRANT_TOKEN).toBe(TOKEN);
    });

    it("is in a file only its owner can read", () => {
      const surface = written();

      expect(statSync(surface.mcpConfigPath!).mode & 0o777).toBe(0o600);
      expect(statSync(join(directory, ".spline")).mode & 0o777).toBe(0o700);
    });
  });

  it("tells the server which workspace and task it serves", () => {
    const surface = written();
    const env = JSON.parse(readFileSync(surface.mcpConfigPath!, "utf8")).mcpServers[
      SERVER_NAME
    ].env;

    expect(env.SPLINE_WORKSPACE_ID).toBe("w-1");
    expect(env.SPLINE_TASK_ID).toBe("t-1");
  });
});
