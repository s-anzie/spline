import { ActorType } from "@repo/db";

import { DomainEvent } from "../kernel/domain/domain-event";
import { RealtimeGateway } from "./realtime.gateway";
import { workspaceRoom } from "./workspace-room";

class SomethingHappened extends DomainEvent {
  constructor(workspaceId: string) {
    super(workspaceId);
  }

  get eventName(): string {
    return "something.happened";
  }
}

function makeSocket(auth: Record<string, unknown>) {
  return {
    handshake: { auth },
    data: {} as Record<string, unknown>,
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  };
}

function makeUpdateAgentPresence() {
  return { execute: jest.fn().mockResolvedValue(undefined) };
}

describe("RealtimeGateway", () => {
  it("disconnects a socket that presents no token", async () => {
    const requesterResolver = { resolve: jest.fn() };
    const permissionsService = { listAccessibleWorkspaceIds: jest.fn() };
    const updateAgentPresence = makeUpdateAgentPresence();
    const gateway = new RealtimeGateway(
      requesterResolver as never,
      permissionsService as never,
      updateAgentPresence as never,
    );
    const socket = makeSocket({});

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(requesterResolver.resolve).not.toHaveBeenCalled();
  });

  it("disconnects a socket presenting an invalid token", async () => {
    const requesterResolver = { resolve: jest.fn().mockResolvedValue(null) };
    const permissionsService = { listAccessibleWorkspaceIds: jest.fn() };
    const updateAgentPresence = makeUpdateAgentPresence();
    const gateway = new RealtimeGateway(
      requesterResolver as never,
      permissionsService as never,
      updateAgentPresence as never,
    );
    const socket = makeSocket({ token: "garbage" });

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("joins a room per accessible workspace for a valid token", async () => {
    const requesterResolver = {
      resolve: jest.fn().mockResolvedValue({ type: ActorType.HUMAN, id: "user-1" }),
    };
    const permissionsService = {
      listAccessibleWorkspaceIds: jest.fn().mockResolvedValue(["w1", "w2"]),
    };
    const updateAgentPresence = makeUpdateAgentPresence();
    const gateway = new RealtimeGateway(
      requesterResolver as never,
      permissionsService as never,
      updateAgentPresence as never,
    );
    const socket = makeSocket({ token: "a.jwt.token" });

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.data.requester).toEqual({ type: ActorType.HUMAN, id: "user-1" });
    expect(socket.join).toHaveBeenCalledWith(workspaceRoom("w1"));
    expect(socket.join).toHaveBeenCalledWith(workspaceRoom("w2"));
    expect(updateAgentPresence.execute).not.toHaveBeenCalled();
  });

  it("marks an agent online when its socket connects", async () => {
    const requesterResolver = {
      resolve: jest.fn().mockResolvedValue({ type: ActorType.AGENT, id: "agent-1" }),
    };
    const permissionsService = { listAccessibleWorkspaceIds: jest.fn().mockResolvedValue([]) };
    const updateAgentPresence = makeUpdateAgentPresence();
    const gateway = new RealtimeGateway(
      requesterResolver as never,
      permissionsService as never,
      updateAgentPresence as never,
    );
    const socket = makeSocket({ token: "agent_cred-1.secret" });

    await gateway.handleConnection(socket as never);

    expect(updateAgentPresence.execute).toHaveBeenCalledWith({ agentId: "agent-1", connected: true });
  });

  it("marks an agent offline when its socket disconnects", async () => {
    const updateAgentPresence = makeUpdateAgentPresence();
    const gateway = new RealtimeGateway({} as never, {} as never, updateAgentPresence as never);
    const socket = { data: { requester: { type: ActorType.AGENT, id: "agent-1" } } };

    await gateway.handleDisconnect(socket as never);

    expect(updateAgentPresence.execute).toHaveBeenCalledWith({ agentId: "agent-1", connected: false });
  });

  it("does nothing on disconnect for a human socket", async () => {
    const updateAgentPresence = makeUpdateAgentPresence();
    const gateway = new RealtimeGateway({} as never, {} as never, updateAgentPresence as never);
    const socket = { data: { requester: { type: ActorType.HUMAN, id: "user-1" } } };

    await gateway.handleDisconnect(socket as never);

    expect(updateAgentPresence.execute).not.toHaveBeenCalled();
  });

  it("does nothing on disconnect for a socket that never authenticated", async () => {
    const updateAgentPresence = makeUpdateAgentPresence();
    const gateway = new RealtimeGateway({} as never, {} as never, updateAgentPresence as never);
    const socket = { data: {} };

    await gateway.handleDisconnect(socket as never);

    expect(updateAgentPresence.execute).not.toHaveBeenCalled();
  });

  it("relays a domain event to the room of its workspace", () => {
    const gateway = new RealtimeGateway({} as never, {} as never, {} as never);
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;

    gateway.relayDomainEvent(new SomethingHappened("w1"));

    expect(to).toHaveBeenCalledWith(workspaceRoom("w1"));
    expect(emit).toHaveBeenCalledWith("something.happened", expect.any(SomethingHappened));
  });
});
