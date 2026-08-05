import { loadConfig } from "./config";

const complete = {
  HUB_URL: "https://hub.spline.test",
  WORKER_TOKEN: "worker-token",
  WORKER_HOSTNAME: "test-box",
};

describe("loadConfig", () => {
  it("refuses to start without a hub, naming what is missing", () => {
    expect(() => loadConfig({})).toThrow(/HUB_URL/);
  });

  /**
   * §6.3 — a machine that has never paired has no token, and that is the
   * normal first run. Requiring one meant an operator had to obtain a
   * credential before the daemon would start, and the only way to obtain one
   * was to write code.
   */
  it("starts without a token, because pairing is how a machine gets one", () => {
    const withoutToken = { ...complete, WORKER_TOKEN: undefined };

    expect(loadConfig(withoutToken).token).toBeNull();
  });

  it("still takes a token from the environment, for a provisioned machine", () => {
    expect(loadConfig(complete).token).toBe("worker-token");
  });

  it("gives each workspace its own directory under one root (§6.10)", () => {
    expect(loadConfig({ ...complete, HOME: "/home/agent" }).workspaceRoot).toBe(
      "/home/agent/.local/share/spline-worker/workspaces",
    );
  });

  it("keeps its identity under the user's config directory, never beside the source", () => {
    const path = loadConfig({ ...complete, HOME: "/home/agent" }).statePath;

    expect(path).toBe("/home/agent/.config/spline-worker/identity.json");
  });

  it("drops a trailing slash so paths are joined once, not twice", () => {
    expect(loadConfig({ ...complete, HUB_URL: "https://hub.spline.test/" }).hubUrl).toBe(
      "https://hub.spline.test",
    );
  });

  describe("the token never travels in clear (§18)", () => {
    it("refuses plain http to a remote host", () => {
      expect(() => loadConfig({ ...complete, HUB_URL: "http://hub.spline.test" })).toThrow(
        /must use https/,
      );
    });

    it("allows plain http to loopback, where nothing leaves the machine", () => {
      for (const url of ["http://localhost:8765", "http://127.0.0.1:8765", "http://[::1]:8765"]) {
        expect(loadConfig({ ...complete, HUB_URL: url }).hubUrl).toBe(url);
      }
    });

    it("allows https anywhere", () => {
      expect(loadConfig({ ...complete, HUB_URL: "https://hub.spline.test" }).hubUrl).toBe(
        "https://hub.spline.test",
      );
    });

    it("refuses a scheme that is not http at all", () => {
      expect(() => loadConfig({ ...complete, HUB_URL: "ws://hub.spline.test" })).toThrow(
        /must be http or https/,
      );
    });

    it("refuses a URL it cannot parse rather than guessing", () => {
      expect(() => loadConfig({ ...complete, HUB_URL: "hub.spline.test" })).toThrow(
        /not a valid URL/,
      );
    });
  });

  /**
   * §18.5 — a process cannot confine itself, so the boundary is the default
   * and running without one is something an operator has to type.
   */
  describe("where a task runs", () => {
    it("puts a task in a container unless told otherwise", () => {
      expect(loadConfig(complete).backend).toBe("container");
    });

    it("lets an operator opt out explicitly", () => {
      expect(loadConfig({ ...complete, EXECUTION_BACKEND: "host" }).backend).toBe(
        "host",
      );
    });

    it("refuses a backend it does not know, rather than falling back", () => {
      expect(() =>
        loadConfig({ ...complete, EXECUTION_BACKEND: "maybe" }),
      ).toThrow(/must be "container" or "host"/);
    });

    it("never proposes root as the user inside the container", () => {
      expect(loadConfig(complete).containerUser).not.toBe("0:0");
    });

    it("bounds memory, CPU and processes without being asked", () => {
      const config = loadConfig(complete);

      expect(config.containerMemory).not.toBe("");
      expect(config.containerCpus).not.toBe("");
      expect(config.containerPids).toBeGreaterThan(0);
    });

    it("refuses a process ceiling too low to run anything", () => {
      expect(() => loadConfig({ ...complete, CONTAINER_PIDS: "2" })).toThrow(
        /at least 16/,
      );
    });
  });

  it("refuses a heartbeat interval too short to mean anything", () => {
    expect(() => loadConfig({ ...complete, HEARTBEAT_INTERVAL_MS: "10" })).toThrow(
      /at least 1000/,
    );
  });

  it("reads capabilities and labels as trimmed lists", () => {
    const config = loadConfig({
      ...complete,
      WORKER_CAPABILITIES: "claude-code, git ,",
      WORKER_LABELS: "gpu",
    });

    expect(config.capabilities).toEqual(["claude-code", "git"]);
    expect(config.labels).toEqual(["gpu"]);
  });
});
