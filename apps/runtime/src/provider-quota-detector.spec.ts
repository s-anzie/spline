import { detectProviderQuota } from "./provider-quota-detector";

describe("detectProviderQuota", () => {
  const now = new Date("2026-08-03T10:00:00.000Z");

  it("extracts a relative provider reset window", () => {
    expect(
      detectProviderQuota("You've hit your usage limit. Try again in 2h 30m.", now),
    ).toEqual(
      expect.objectContaining({ resetAt: "2026-08-03T12:30:00.000Z" }),
    );
  });

  it("extracts an ISO reset timestamp", () => {
    expect(
      detectProviderQuota(
        'rate_limit_error reset_at="2026-08-04T08:15:00Z"',
        now,
      ),
    ).toEqual(
      expect.objectContaining({ resetAt: "2026-08-04T08:15:00.000Z" }),
    );
  });

  it("extracts a provider reset expressed as a local clock time", () => {
    const result = detectProviderQuota("You've hit your usage limit · resets at 6pm", now);
    const expected = new Date(now);
    expected.setHours(18, 0, 0, 0);
    expect(result?.resetAt).toBe(expected.toISOString());
  });

  it("does not mistake ordinary discussion of limits for a quota failure", () => {
    expect(detectProviderQuota("We should limit this component to 3 items.", now)).toBeNull();
  });

  it("uses a conservative retry window when the provider omits its reset", () => {
    expect(detectProviderQuota("429 too many requests", now)).toEqual(
      expect.objectContaining({ resetAt: "2026-08-03T10:15:00.000Z" }),
    );
  });
});
