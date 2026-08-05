import { callHub, settingsFrom } from "./server";

const settings = {
  hubUrl: "http://hub.test",
  context: { workspaceId: "w-1", taskId: "t-1" },
  grantToken: "grant_abc.secret",
};

describe("settingsFrom", () => {
  const complete = {
    SPLINE_HUB_URL: "http://hub.test/",
    SPLINE_WORKSPACE_ID: "w-1",
    SPLINE_TASK_ID: "t-1",
    SPLINE_GRANT_TOKEN: "grant_abc.secret",
  };

  it("reads what the bridge was given", () => {
    expect(settingsFrom(complete)).toEqual(settings);
  });

  /**
   * A bridge that started without its credential would answer every tool call
   * with an authentication error, and the agent would report a hub that is
   * "down" — a diagnosis pointing at the wrong thing entirely.
   */
  it.each(Object.keys(complete))("refuses to start without %s", (key) => {
    expect(() => settingsFrom({ ...complete, [key]: "" })).toThrow(key);
  });
});

describe("callHub", () => {
  const original = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = original;
  });

  function answering(status: number, body: string) {
    const spy = jest.fn().mockResolvedValue({
      ok: status < 400,
      status,
      text: async () => body,
    });
    globalThis.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it("carries the grant, and never follows a redirect with it", async () => {
    const spy = answering(200, "{}");

    await callHub(settings, { method: "GET", path: "/workspaces/w-1/tasks" });

    expect(spy.mock.calls[0][0]).toBe("http://hub.test/workspaces/w-1/tasks");
    expect(spy.mock.calls[0][1].headers.authorization).toBe("Bearer grant_abc.secret");
    expect(spy.mock.calls[0][1].redirect).toBe("error");
  });

  it("returns the body when the hub agrees", async () => {
    answering(200, '{"status":"READY"}');

    expect(await callHub(settings, { method: "GET", path: "/x" })).toBe(
      '{"status":"READY"}',
    );
  });

  /**
   * §20.6 — a refusal the agent can act on. Throwing would tell it nothing;
   * "403: this grant does not carry manage_tasks" tells it exactly what it
   * may not do, which is the difference between retrying blindly and
   * reporting a blocker.
   */
  it("hands a refusal back as text the agent can read", async () => {
    answering(403, "this grant does not carry manage_tasks");

    const answer = await callHub(settings, { method: "POST", path: "/x" });

    expect(answer).toContain("403");
    expect(answer).toContain("manage_tasks");
  });

  it("says the hub is unreachable rather than throwing into the transport", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    expect(await callHub(settings, { method: "GET", path: "/x" })).toContain(
      "ECONNREFUSED",
    );
  });

  it("sends a body only when there is one", async () => {
    const spy = answering(200, "{}");

    await callHub(settings, { method: "GET", path: "/x" });
    expect(spy.mock.calls[0][1].body).toBeUndefined();

    await callHub(settings, { method: "POST", path: "/x", body: { a: 1 } });
    expect(spy.mock.calls[1][1].body).toBe('{"a":1}');
  });
});
