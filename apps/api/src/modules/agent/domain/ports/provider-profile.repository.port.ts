import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { ProviderProfile } from "../provider-profile";

export const PROVIDER_PROFILE_REPOSITORY = Symbol("PROVIDER_PROFILE_REPOSITORY");

export interface ProviderProfileRepository {
  findById(id: UniqueEntityId): Promise<ProviderProfile | null>;
  findByProvider(provider: string): Promise<ProviderProfile | null>;
  list(): Promise<ProviderProfile[]>;
  save(profile: ProviderProfile): Promise<void>;
}
