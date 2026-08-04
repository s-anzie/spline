import { EventEmitter2 } from "@nestjs/event-emitter";

import { ProviderProfile } from "../domain/provider-profile";
import { InMemoryProviderProfileRepository } from "./testing/in-memory-provider-profile.repository";
import { UpdateProviderAvailabilityUseCase } from "./update-provider-availability.use-case";

function setup() {
  const profiles = new InMemoryProviderProfileRepository();
  const events = new EventEmitter2();
  const useCase = new UpdateProviderAvailabilityUseCase(profiles, events);
  return { profiles, useCase };
}

describe("UpdateProviderAvailabilityUseCase", () => {
  it("reactivating a provider clears any quota lockout, not just the manual flag", async () => {
    const { profiles, useCase } = setup();
    const profile = ProviderProfile.create({ provider: "claude" });
    profile.updateConfig({
      available: false,
      quotaUnavailableUntil: new Date("2099-01-01T00:00:00Z"),
      quotaReason: "429 too many requests",
    });
    // Sanity check: the profile really is locked out before reactivation.
    expect(profile.available).toBe(false);
    await profiles.save(profile);

    const result = await useCase.execute("claude", true);

    expect(result.available).toBe(true);
    expect(result.quotaUnavailableUntil).toBeNull();
    expect(result.quotaReason).toBeNull();
  });

  it("manually disabling a provider does not fabricate a quota reason", async () => {
    const { profiles, useCase } = setup();
    const profile = ProviderProfile.create({ provider: "claude" });
    await profiles.save(profile);

    const result = await useCase.execute("claude", false);

    expect(result.manuallyAvailable).toBe(false);
    expect(result.quotaUnavailableUntil).toBeNull();
    expect(result.quotaReason).toBeNull();
  });
});
