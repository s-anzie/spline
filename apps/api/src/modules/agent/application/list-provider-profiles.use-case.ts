import { Inject, Injectable } from "@nestjs/common";

import { ProviderProfile } from "../domain/provider-profile";
import {
  PROVIDER_PROFILE_REPOSITORY,
  ProviderProfileRepository,
} from "../domain/ports/provider-profile.repository.port";

@Injectable()
export class ListProviderProfilesUseCase {
  constructor(
    @Inject(PROVIDER_PROFILE_REPOSITORY) private readonly profiles: ProviderProfileRepository,
  ) {}

  async execute(): Promise<ProviderProfile[]> {
    return this.profiles.list();
  }
}
