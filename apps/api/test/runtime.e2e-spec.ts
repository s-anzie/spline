import { AddressInfo } from "node:net";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { io, Socket } from "socket.io-client";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { SingleServerIoAdapter } from "../src/realtime/single-server-io.adapter";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Runtime (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  const openSockets: Socket[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useWebSocketAdapter(new SingleServerIoAdapter(app));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    while (openSockets.length > 0) {
      openSockets.pop()?.close();
    }
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  function connectMachine(token: string): Socket {
    const socket = io(`${baseUrl}/machines`, {
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    openSockets.push(socket);
    return socket;
  }

  function waitFor<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      socket.once(event, resolve);
      setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), 4000);
    });
  }

  /**
   * The client "connect" event fires once the transport handshake
   * completes, before the server's async handleConnection (token
   * verification via bcrypt, presence update, command delivery) has
   * necessarily finished — bcrypt compare alone can take a few hundred ms.
   * Give it real margin rather than racing a short fixed delay.
   */
  async function waitForConnection(socket: Socket): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => resolve());
      socket.on("connect_error", reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  async function registerLoginAndCreateWorkspace(email: string): Promise<{ token: string; workspaceId: string }> {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email, password: "correct-horse", displayName: email })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "correct-horse" })
      .expect(200);
    const token = login.body.token as string;
    const workspace = await request(app.getHttpServer())
      .post("/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Runtime workspace" })
      .expect(201);
    return { token, workspaceId: workspace.body.id as string };
  }

  async function registerAndLinkMachine(
    token: string,
    workspaceId: string,
  ): Promise<{ machineId: string; machineToken: string }> {
    const registered = await request(app.getHttpServer())
      .post("/machines")
      .set("Authorization", `Bearer ${token}`)
      .send({ hostname: "bradley-dev", os: "linux" })
      .expect(201);
    const machineId = registered.body.id as string;
    const machineToken = registered.body.token as string;
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/machines/${machineId}/link`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    return { machineId, machineToken };
  }

  it(
    "runs the full process lifecycle through a simulated machine daemon",
    async () => {
      const { token, workspaceId } = await registerLoginAndCreateWorkspace("runtime-process@example.com");
      const { machineId, machineToken } = await registerAndLinkMachine(token, workspaceId);
      await request(app.getHttpServer())
        .patch(`/workspaces/${workspaceId}/root-path`)
        .set("Authorization", `Bearer ${token}`)
        .send({ rootPath: "/home/bradley/dev-apps/spline" })
        .expect(200);

      const created = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/processes`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Dev server", command: "npm run dev", cwd: "apps/web" })
        .expect(201);
      const processId = created.body.id as string;

      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/locks`)
        .set("Authorization", `Bearer ${token}`)
        .send({ resourceType: "PROCESS", resourceId: processId })
        .expect(201);

      const machineSocket = connectMachine(machineToken);
      const commandReceived = waitFor<{ type: string; payload: { processId: string; cwd: string } }>(
        machineSocket,
        "command",
      );
      await waitForConnection(machineSocket);

      const started = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/processes/${processId}/start`)
        .set("Authorization", `Bearer ${token}`)
        .send({ machineId })
        .expect(201);
      expect(started.body.status).toBe("STARTING");

      // The command was enqueued after connect, so it's only delivered on
      // the next heartbeat piggyback (documented MachineGateway behavior) —
      // simulate the daemon's periodic heartbeat to pick it up.
      machineSocket.emit("machine_heartbeat");
      const command = await commandReceived;
      expect(command.type).toBe("START_PROCESS");
      expect(command.payload.processId).toBe(processId);
      expect(command.payload.cwd).toBe("/home/bradley/dev-apps/spline/apps/web");

      machineSocket.emit("process_started", { processId, pid: 4242 });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const running = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/processes/${processId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(running.body.status).toBe("RUNNING");
      expect(running.body.pid).toBe(4242);

      const stopCommandReceived = waitFor<{ type: string }>(machineSocket, "command");
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/processes/${processId}/stop`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);
      machineSocket.emit("machine_heartbeat");
      const stopCommand = await stopCommandReceived;
      expect(stopCommand.type).toBe("STOP_PROCESS");

      machineSocket.emit("process_exited", { processId, exitCode: 0 });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopped = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/processes/${processId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(stopped.body.status).toBe("STOPPED");
    },
    15000,
  );

  it(
    "runs an agent session lifecycle through a simulated machine daemon",
    async () => {
      const { token, workspaceId } = await registerLoginAndCreateWorkspace("runtime-session@example.com");
      const { machineId, machineToken } = await registerAndLinkMachine(token, workspaceId);

      const agent = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/agents`)
        .set("Authorization", `Bearer ${token}`)
        .send({ provider: "claude", displayName: "Claude worker" })
        .expect(201);

      const machineSocket = connectMachine(machineToken);
      const commandReceived = waitFor<{ type: string; payload: { sessionId: string; prompt: string } }>(
        machineSocket,
        "command",
      );
      await waitForConnection(machineSocket);

      const started = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/agent-sessions`)
        .set("Authorization", `Bearer ${token}`)
        .send({ agentId: agent.body.id, machineId })
        .expect(201);
      expect(started.body.status).toBe("STARTING");
      const sessionId = started.body.id as string;

      machineSocket.emit("machine_heartbeat");
      const command = await commandReceived;
      expect(command.type).toBe("START_SESSION");
      expect(command.payload.sessionId).toBe(sessionId);
      expect(command.payload.prompt).toContain("claude");

      machineSocket.emit("session_status", { sessionId, status: "RUNNING" });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const running = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/agent-sessions/${sessionId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(running.body.status).toBe("RUNNING");

      machineSocket.emit("session_heartbeat", { sessionId });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const afterHeartbeat = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/agent-sessions/${sessionId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(afterHeartbeat.body.lastHeartbeatAt).not.toBeNull();
    },
    15000,
  );

  it(
    "marks a machine ONLINE on connect and OFFLINE on disconnect",
    async () => {
      const { token, workspaceId } = await registerLoginAndCreateWorkspace("runtime-presence@example.com");
      const { machineId, machineToken } = await registerAndLinkMachine(token, workspaceId);

      const socket = connectMachine(machineToken);
      await waitForConnection(socket);

      const online = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/machines`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(online.body.find((m: { id: string }) => m.id === machineId)?.runtimeStatus).toBe("ONLINE");

      socket.close();
      await new Promise((resolve) => setTimeout(resolve, 500));

      const offline = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/machines`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(offline.body.find((m: { id: string }) => m.id === machineId)?.runtimeStatus).toBe("OFFLINE");
    },
    10000,
  );
});
