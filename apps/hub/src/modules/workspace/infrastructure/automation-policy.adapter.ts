import { Global, Inject, Injectable, Module } from "@nestjs/common";

import {
  AUTOMATION_POLICY,
  AutomationPolicy,
} from "../../runtime/domain/ports/dispatch.port";
import {
  DELEGATED_POWERS,
  DelegatedPowers,
} from "../../identity/domain/ports/delegated-powers.port";
import {
  Permission,
  WorkspaceRole,
} from "../../identity/domain/permission-matrix";
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

/**
 * §18.3 — the exceptions this workspace's owner has signed.
 *
 * Identity declares the port and never learns to read a workspace's
 * settings; this module holds them and answers. Today there is exactly one
 * exception worth lending, and it is deliberately spelled out rather than
 * driven by a table: a power that can be granted by writing its NAME into a
 * settings bag is a power anybody with `manage_workspace` can grant
 * themselves, whatever the matrix says.
 */
@Injectable()
export class DelegatedPowersAdapter implements DelegatedPowers {
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
  ) {}

  async lentTo(
    role: WorkspaceRole,
    workspaceId: string,
  ): Promise<readonly Permission[]> {
    if (role !== "AGENT_MANAGER") {
      return [];
    }
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      return [];
    }
    return automationOf(workspace.settings).managerJudgesItsTeam
      ? ["approve_validation"]
      : [];
  }
}

/** Global, and importing what it borrows: see the note in kernel/doc.md. */
@Global()
@Module({
  imports: [WorkspaceModule],
  providers: [
    AutomationPolicyAdapter,
    { provide: AUTOMATION_POLICY, useExisting: AutomationPolicyAdapter },
    DelegatedPowersAdapter,
    { provide: DELEGATED_POWERS, useExisting: DelegatedPowersAdapter },
  ],
  exports: [AUTOMATION_POLICY, DELEGATED_POWERS],
})
export class AutomationPolicyModule {}
