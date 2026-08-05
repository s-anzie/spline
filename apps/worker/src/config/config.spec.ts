import { loadConfig } from "./config";

const complete = {
  HUB_URL: "https://hub.spline.test",
  WORKER_TOKEN: "worker-token",
  WORKER_HOSTNAME: "test-box",
};

describe("loadConfig", () => {
  it("refuses to start without a hub or a token, naming what is missing", () => {
    expect(() => loadConfig({})).toThrow(/HUB_URL, WORKER_TOKEN/);
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
