import { Global, Inject, Injectable, Module } from "@nestjs/common";

import {
  AUTOMATION_POLICY,
  AutomationPolicy,
} from "../../runtime/domain/ports/dispatch.port";
import { AUTOMATION_DEFAULTS, automationOf } from "../domain/automation";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../domain/ports/workspace.repository.port";
import { WorkspaceModule } from "../workspace.module";

/**
 * §9 — what this workspace allows the hub to do on its own.
 *
 * A workspace that has vanished answers "nothing automatic", not the
 * defaults: dispatching into a workspace nobody can find is the one case
 * where being generous is being wrong.
 */
@Injectable()
export class AutomationPolicyAdapter implements AutomationPolicy {
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
  ) {}

  async limitsFor(workspaceId: string): Promise<{
    automatic: boolean;
    concurrentRuns: number;
    runsPerDay: number;
  }> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      return {
        automatic: false,
        concurrentRuns: AUTOMATION_DEFAULTS.concurrentRuns,
        runsPerDay: AUTOMATION_DEFAULTS.runsPerDay,
      };
    }
    return automationOf(workspace.settings);
  }
}

/** Global, and importing what it borrows: see the note in kernel/doc.md. */
@Global()
@Module({
  imports: [WorkspaceModule],
  providers: [
    AutomationPolicyAdapter,
    { provide: AUTOMATION_POLICY, useExisting: AutomationPolicyAdapter },
  ],
  exports: [AUTOMATION_POLICY],
})
export class AutomationPolicyModule {}
