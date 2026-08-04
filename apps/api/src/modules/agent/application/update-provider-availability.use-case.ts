import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import {
  PROVIDER_PROFILE_REPOSITORY,
  ProviderProfileRepository,
} from "../domain/ports/provider-profile.repository.port";
import { ProviderProfile } from "../domain/provider-profile";

@Injectable()
export class UpdateProviderAvailabilityUseCase {
  constructor(
    @Inject(PROVIDER_PROFILE_REPOSITORY)
    private readonly profiles: ProviderProfileRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(provider: string, available: boolean): Promise<ProviderProfile> {
    const profile = await this.profiles.findByProvider(provider);
    if (!profile) throw new NotFoundException(`Provider "${provider}" was not found`);
    profile.updateConfig(
      // A manual reactivation must clear any automatic quota lockout too —
      // otherwise the computed `available` getter stays false forever
      // (quotaUnavailableUntil is still in the future), silently ignoring
      // the human's override. A manual disable is a separate, deliberate
      // action and should not fabricate a quota reason.
      available
        ? { available, quotaUnavailableUntil: null, quotaReason: null }
        : { available },
    );
    await this.profiles.save(profile);
    this.events.emit("provider.availability_changed", { provider, available });
    return profile;
  }
}
