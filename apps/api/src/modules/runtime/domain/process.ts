import { ProcessStatus, RestartPolicy } from "@repo/db";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ProcessRegistered, ProcessStatusChanged } from "./process-events";
import {
  EmptyProcessCommandError,
  EmptyProcessNameError,
  InvalidProcessStatusTransitionError,
  ProcessMustBeStoppedError,
} from "./process.errors";

const ALLOWED_TRANSITIONS: Record<ProcessStatus, ProcessStatus[]> = {
  [ProcessStatus.STOPPED]: [ProcessStatus.STARTING],
  [ProcessStatus.STARTING]: [ProcessStatus.RUNNING, ProcessStatus.CRASHED, ProcessStatus.STOPPED],
  [ProcessStatus.RUNNING]: [ProcessStatus.STOPPING, ProcessStatus.CRASHED],
  [ProcessStatus.STOPPING]: [ProcessStatus.STOPPED, ProcessStatus.CRASHED],
  [ProcessStatus.CRASHED]: [ProcessStatus.STARTING],
};

export interface ProcessProps {
  workspaceId: string;
  name: string;
  command: string;
  cwd: string;
  env: Record<string, string>;
  status: ProcessStatus;
  ownerAgentId?: string;
  ownerSessionId?: string;
  machineId?: string;
  pid?: number;
  ports: number[];
  logsRef?: string;
  restartPolicy: RestartPolicy;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterProcessProps {
  workspaceId: string;
  name: string;
  command: string;
  cwd: string;
  env?: Record<string, string>;
  ownerAgentId?: string;
  ports?: number[];
  restartPolicy?: RestartPolicy;
}

export interface UpdateProcessDetailsProps {
  name?: string;
  command?: string;
  cwd?: string;
  env?: Record<string, string>;
  ports?: number[];
  restartPolicy?: RestartPolicy;
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new EmptyProcessNameError();
  }
  return trimmed;
}

function normalizeCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new EmptyProcessCommandError();
  }
  return trimmed;
}

export class Process extends AggregateRoot<ProcessProps> {
  static create(props: RegisterProcessProps, id?: UniqueEntityId): Process {
    const now = new Date();
    const process = new Process(
      {
        workspaceId: props.workspaceId,
        name: normalizeName(props.name),
        command: normalizeCommand(props.command),
        cwd: props.cwd,
        env: props.env ?? {},
        status: ProcessStatus.STOPPED,
        ownerAgentId: props.ownerAgentId,
        ports: props.ports ?? [],
        restartPolicy: props.restartPolicy ?? RestartPolicy.NEVER,
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
    process.record(new ProcessRegistered(process.props.workspaceId, process.id.toString()));
    return process;
  }

  static reconstitute(props: ProcessProps, id: UniqueEntityId): Process {
    return new Process(props, id);
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get name(): string {
    return this.props.name;
  }

  get command(): string {
    return this.props.command;
  }

  get cwd(): string {
    return this.props.cwd;
  }

  get env(): Record<string, string> {
    return this.props.env;
  }

  get status(): ProcessStatus {
    return this.props.status;
  }

  get ownerAgentId(): string | undefined {
    return this.props.ownerAgentId;
  }

  get ownerSessionId(): string | undefined {
    return this.props.ownerSessionId;
  }

  get machineId(): string | undefined {
    return this.props.machineId;
  }

  get pid(): number | undefined {
    return this.props.pid;
  }

  get ports(): readonly number[] {
    return this.props.ports;
  }

  get logsRef(): string | undefined {
    return this.props.logsRef;
  }

  get restartPolicy(): RestartPolicy {
    return this.props.restartPolicy;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  updateDetails(props: UpdateProcessDetailsProps): void {
    if (this.props.status !== ProcessStatus.STOPPED) {
      throw new ProcessMustBeStoppedError(this.id.toString());
    }
    if (props.name !== undefined) {
      this.props.name = normalizeName(props.name);
    }
    if (props.command !== undefined) {
      this.props.command = normalizeCommand(props.command);
    }
    if (props.cwd !== undefined) {
      this.props.cwd = props.cwd;
    }
    if (props.env !== undefined) {
      this.props.env = props.env;
    }
    if (props.ports !== undefined) {
      this.props.ports = props.ports;
    }
    if (props.restartPolicy !== undefined) {
      this.props.restartPolicy = props.restartPolicy;
    }
    this.props.updatedAt = new Date();
  }

  changeStatus(next: ProcessStatus, at: Date = new Date()): void {
    const current = this.props.status;
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
      throw new InvalidProcessStatusTransitionError(current, next);
    }
    this.props.status = next;
    this.props.updatedAt = at;
    if (next === ProcessStatus.STOPPED || next === ProcessStatus.CRASHED) {
      this.props.pid = undefined;
    }
    this.record(new ProcessStatusChanged(this.props.workspaceId, this.id.toString(), current, next));
  }

  /** Dispatched to a machine (start requested) — recorded alongside the STARTING transition. */
  recordDispatch(machineId: string, ownerSessionId: string | undefined, at: Date = new Date()): void {
    this.props.machineId = machineId;
    this.props.ownerSessionId = ownerSessionId;
    this.props.updatedAt = at;
  }

  /** Confirmed running by the machine — records the real OS pid. */
  recordPid(pid: number, at: Date = new Date()): void {
    this.props.pid = pid;
    this.props.updatedAt = at;
  }

  recordLogsRef(logsRef: string, at: Date = new Date()): void {
    this.props.logsRef = logsRef;
    this.props.updatedAt = at;
  }
}
