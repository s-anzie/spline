import { ProviderProfile } from "../domain/provider-profile";
import { ListProviderProfilesUseCase } from "./list-provider-profiles.use-case";
import { InMemoryProviderProfileRepository } from "./testing/in-memory-provider-profile.repository";

describe("ListProviderProfilesUseCase", () => {
  it("lists every provider profile", async () => {
    const profiles = new InMemoryProviderProfileRepository();
    await profiles.save(ProviderProfile.create({ provider: "claude" }));
    await profiles.save(ProviderProfile.create({ provider: "codex" }));
    const useCase = new ListProviderProfilesUseCase(profiles);

    const found = await useCase.execute();

    expect(found.map((p) => p.provider).sort()).toEqual(["claude", "codex"]);
  });
});
