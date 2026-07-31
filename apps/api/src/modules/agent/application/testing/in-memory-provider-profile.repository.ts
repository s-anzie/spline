import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { ProviderProfileRepository } from "../../domain/ports/provider-profile.repository.port";
import { ProviderProfile } from "../../domain/provider-profile";

export class InMemoryProviderProfileRepository implements ProviderProfileRepository {
  private readonly profiles = new Map<string, ProviderProfile>();

  async findById(id: UniqueEntityId): Promise<ProviderProfile | null> {
    return this.profiles.get(id.toString()) ?? null;
  }

  async findByProvider(provider: string): Promise<ProviderProfile | null> {
    return [...this.profiles.values()].find((p) => p.provider === provider) ?? null;
  }

  async list(): Promise<ProviderProfile[]> {
    return [...this.profiles.values()];
  }

  async save(profile: ProviderProfile): Promise<void> {
    this.profiles.set(profile.id.toString(), profile);
  }
}
