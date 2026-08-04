import type { CommandMessage } from "./hub-connection";

export interface ProcessSupervisorLike {
  start(processId: string, command: string, cwd: string, env?: Record<string, string>): void;
  stop(processId: string, signal?: NodeJS.Signals): void;
}

export interface SessionSupervisorLike {
  start(sessionId: string, provider: string, prompt: string, cwd: string, env?: Record<string, string>, resumeSessionId?: string, outputSequenceStart?: number): void;
  stop(sessionId: string, signal?: NodeJS.Signals): void;
}

export interface CommandDispatcherDeps {
  processSupervisor: ProcessSupervisorLike;
  sessionSupervisor: SessionSupervisorLike;
  onError?: (error: Error, command: CommandMessage) => void;
  onDispatched?: (command: CommandMessage) => void;
  resolveAgentEnvironment?: (
    agentId: string,
    workspaceId: string,
  ) => Record<string, string>;
}

interface StartProcessPayload {
  processId: string;
  command: string;
  cwd: string;
  env?: Record<string, string>;
}

interface StopProcessPayload {
  processId: string;
}

interface StartSessionPayload {
  sessionId: string;
  agentId: string;
  provider: string;
  prompt: string;
  cwd: string;
  env?: Record<string, string>;
  resumeProviderSessionId?: string;
  outputSequenceStart?: number;
}

interface StopSessionPayload {
  sessionId: string;
}

/** Routes commands pushed by MachineGateway to the matching supervisor. One bad command must never kill the connection loop. */
export class CommandDispatcher {
  constructor(private readonly deps: CommandDispatcherDeps) {}

  dispatch(command: CommandMessage): void {
    try {
      this.route(command);
      this.deps.onDispatched?.(command);
    } catch (error) {
      this.deps.onError?.(error instanceof Error ? error : new Error(String(error)), command);
    }
  }

  private route(command: CommandMessage): void {
    switch (command.type) {
      case "START_PROCESS": {
        const { processId, command: cmd, cwd, env } = command.payload as StartProcessPayload;
        this.deps.processSupervisor.start(processId, cmd, cwd, env);
        return;
      }
      case "STOP_PROCESS": {
        const { processId } = command.payload as StopProcessPayload;
        this.deps.processSupervisor.stop(processId);
        return;
      }
      case "START_SESSION": {
        const { sessionId, agentId, provider, prompt, cwd, env, resumeProviderSessionId, outputSequenceStart } = command.payload as StartSessionPayload;
        const agentEnvironment = this.deps.resolveAgentEnvironment?.(
          agentId,
          command.workspaceId,
        );
        const sessionEnvironment =
          env || agentEnvironment
            ? {
                ...env,
                ...agentEnvironment,
                SPLINE_SESSION_ID: sessionId,
              }
            : { SPLINE_SESSION_ID: sessionId };
        this.deps.sessionSupervisor.start(
          sessionId,
          provider,
          prompt,
          cwd,
          sessionEnvironment,
          resumeProviderSessionId,
          outputSequenceStart,
        );
        return;
      }
      case "STOP_SESSION": {
        const { sessionId } = command.payload as StopSessionPayload;
        this.deps.sessionSupervisor.stop(sessionId);
        return;
      }
      default:
        throw new Error(`Unknown runtime command type: "${command.type}" (id: ${command.id})`);
    }
  }
}
