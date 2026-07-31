import { LocalMachineRuntimeStatus } from "@repo/db";

import { DomainEvent } from "../../../kernel/domain/domain-event";

/**
 * LocalMachine isn't workspace-scoped by identity (one machine can serve
 * several workspaces), so its events carry an explicit workspaceId per call
 * rather than one fixed at construction — DomainEvent still requires one for
 * the generic RealtimeGateway relay, so these events are emitted once per
 * linked workspace where relevant. Registration itself has no linked
 * workspace yet, so it emits no event — nothing has an audience for it yet.
 */
export class MachineLinkedToWorkspace extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly machineId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "local_machine.linked_to_workspace";
  }
}

export class MachineRuntimeStatusChanged extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly machineId: string,
    public readonly from: LocalMachineRuntimeStatus,
    public readonly to: LocalMachineRuntimeStatus,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "local_machine.runtime_status_changed";
  }
}
