import { Global, Inject, Injectable, Module } from "@nestjs/common";

import {
  AUTOMATION_POLICY,
  AutomationPolicy,
} from "../../runtime/domain/ports/dispatch.port";
import { AutomationLimits, automationOf } from "../domain/automation";
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

  async limitsFor(workspaceId: string): Promise<AutomationLimits> {
    const workspace = await this.workspaces.findById(workspaceId);
    // A workspace that is not there automates nothing, and reads the same
    // defaults as one that never configured anything.
    return workspace ? automationOf(workspace.settings) : automationOf({});
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
