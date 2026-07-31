import { ActorType } from "@repo/db";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { OnEvent } from "@nestjs/event-emitter";
import { Server, Socket } from "socket.io";

import { DomainEvent } from "../kernel/domain/domain-event";
import { UpdateAgentPresenceUseCase } from "../modules/agent/application/update-agent-presence.use-case";
import { PermissionsService } from "../modules/identity/application/permissions.service";
import { RequesterResolver } from "../modules/identity/interface/requester-resolver";
import { workspaceRoom } from "./workspace-room";

@WebSocketGateway({ cors: { origin: "*" } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly requesterResolver: RequesterResolver,
    private readonly permissionsService: PermissionsService,
    private readonly updateAgentPresence: UpdateAgentPresenceUseCase,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.["token"] as string | undefined;
    const requester = token ? await this.requesterResolver.resolve(token) : null;

    if (!requester) {
      client.disconnect(true);
      return;
    }

    client.data.requester = requester;

    const workspaceIds = await this.permissionsService.listAccessibleWorkspaceIds(
      requester.type,
      requester.id,
    );
    await Promise.all(workspaceIds.map((workspaceId) => client.join(workspaceRoom(workspaceId))));

    if (requester.type === ActorType.AGENT) {
      await this.updateAgentPresence.execute({ agentId: requester.id, connected: true });
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    // socket.io automatically removes the socket from every room it was in.
    const requester = client.data?.requester as { type: ActorType; id: string } | undefined;
    if (requester?.type === ActorType.AGENT) {
      await this.updateAgentPresence.execute({ agentId: requester.id, connected: false });
    }
  }

  @OnEvent("**")
  relayDomainEvent(event: DomainEvent): void {
    if (!event?.eventName || !event.workspaceId) {
      return;
    }
    this.server.to(workspaceRoom(event.workspaceId)).emit(event.eventName, event);
  }
}
