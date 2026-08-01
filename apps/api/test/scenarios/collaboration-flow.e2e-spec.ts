import { AddressInfo } from "node:net";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { io, Socket } from "socket.io-client";
import request from "supertest";

import { AppModule } from "../../src/app.module";
import { SingleServerIoAdapter } from "../../src/realtime/single-server-io.adapter";
import { PrismaService } from "../../src/prisma/prisma.service";
import { resetDatabase } from "../setup/reset-database";

/**
 * Materializes the end-to-end guarantees of spec section 10 across every
 * module built this session: Workspace -> Goal -> Task -> Agent claims the
 * task -> ResourceLock -> Process (dispatched to a simulated machine
 * daemon) -> Decision -> Event -> Notification, with a human WS client
 * subscribed to the workspace room throughout, asserting every module's
 * domain events actually reach a live realtime subscriber — not just that
 * each module works in isolation.
 */
describe("Collaboration flow (e2e scenario)", () => {
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

  function connectHuman(token: string): Socket {
    const socket = io(baseUrl, { auth: { token }, transports: ["websocket"], forceNew: true });
    openSockets.push(socket);
    return socket;
  }

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

  /** See runtime.e2e-spec.ts: the transport "connect" event races the server's async handleConnection. */
  async function waitForConnection(socket: Socket): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => resolve());
      socket.on("connect_error", reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  it(
    "runs the full collaboration loop and relays every module's domain events to a subscribed human client",
    async () => {
      // --- Owner registers, creates a workspace, configures its filesystem root ---
      await request(app.getHttpServer())
        .post("/auth/register")
        .send({ email: "owner@example.com", password: "correct-horse", displayName: "Owner" })
        .expect(201);
      const ownerLogin = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "owner@example.com", password: "correct-horse" })
        .expect(200);
      const ownerToken = ownerLogin.body.token as string;

      const workspace = await request(app.getHttpServer())
        .post("/workspaces")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Collaboration flow workspace" })
        .expect(201);
      const workspaceId = workspace.body.id as string;

      await request(app.getHttpServer())
        .patch(`/workspaces/${workspaceId}/root-path`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ rootPath: "/home/bradley/dev-apps/spline" })
        .expect(200);

      // --- Human WS client subscribes to the workspace room before anything interesting happens ---
      const humanSocket = connectHuman(ownerToken);
      await waitForConnection(humanSocket);
      const received: Array<{ eventName: string; payload: unknown }> = [];
      humanSocket.onAny((eventName: string, payload: unknown) => received.push({ eventName, payload }));

      // --- Goal + Task ---
      const goal = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/goals`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ title: "Ship the collaboration flow" })
        .expect(201);
      const goalId = goal.body.id as string;
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/goals/${goalId}/status`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ status: "ACTIVE" })
        .expect(201);

      const task = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/tasks`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ goalId, title: "Start the dev server" })
        .expect(201);
      const taskId = task.body.id as string;

      // --- Agent registers and is assigned the task ---
      const agentRegistration = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/agents`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ provider: "claude", displayName: "Worker agent" })
        .expect(201);
      const agentId = agentRegistration.body.id as string;
      const agentToken = agentRegistration.body.token as string;

      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/tasks/${taskId}/assign`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ assigneeType: "AGENT", assigneeId: agentId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/tasks/${taskId}/status`)
        .set("Authorization", `Bearer ${agentToken}`)
        .send({ status: "TODO" })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/tasks/${taskId}/status`)
        .set("Authorization", `Bearer ${agentToken}`)
        .send({ status: "IN_PROGRESS" })
        .expect(201);

      // --- Agent registers a process, locks it, then starts it on a real (simulated) machine daemon ---
      const machineRegistration = await request(app.getHttpServer())
        .post("/machines")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ hostname: "bradley-dev", os: "linux" })
        .expect(201);
      const machineId = machineRegistration.body.id as string;
      const machineToken = machineRegistration.body.token as string;
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/machines/${machineId}/link`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(201);

      const process = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/processes`)
        .set("Authorization", `Bearer ${agentToken}`)
        .send({ name: "Dev server", command: "npm run dev", cwd: "apps/web" })
        .expect(201);
      const processId = process.body.id as string;

      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/locks`)
        .set("Authorization", `Bearer ${agentToken}`)
        .send({ resourceType: "PROCESS", resourceId: processId, reason: "starting the dev server" })
        .expect(201);

      const machineSocket = connectMachine(machineToken);
      const commandReceived = waitFor<{ type: string; payload: { processId: string } }>(machineSocket, "command");
      await waitForConnection(machineSocket);

      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/processes/${processId}/start`)
        .set("Authorization", `Bearer ${agentToken}`)
        .send({ machineId })
        .expect(201);
      machineSocket.emit("machine_heartbeat");
      const command = await commandReceived;
      expect(command.type).toBe("START_PROCESS");

      machineSocket.emit("process_started", { processId, pid: 4242 });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const runningProcess = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/processes/${processId}`)
        .set("Authorization", `Bearer ${agentToken}`)
        .expect(200);
      expect(runningProcess.body.status).toBe("RUNNING");

      // --- Agent records why it made this choice, and journals the outcome ---
      const decision = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/decisions`)
        .set("Authorization", `Bearer ${agentToken}`)
        .send({ subject: "How to start the dev server", decision: "Use npm run dev directly" })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/events`)
        .set("Authorization", `Bearer ${agentToken}`)
        .send({ type: "agent.action_result", payload: { taskId, processId, summary: "dev server is up" } })
        .expect(201);

      // --- Agent finishes the task; owner validates it, which cascades into goal progress ---
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/tasks/${taskId}/status`)
        .set("Authorization", `Bearer ${agentToken}`)
        .send({ status: "IN_REVIEW" })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/tasks/${taskId}/validate`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(201);

      const reloadedGoal = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/goals/${goalId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(200);
      expect(reloadedGoal.body.progressPercentage).toBe(100);

      // --- Owner broadcasts a system alert announcing completion ---
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/notifications`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ kind: "SYSTEM_ALERT", scope: "BROADCAST", title: "Task completed", body: "Dev server is running" })
        .expect(201);

      // --- The unread cross-workspace query sees the broadcast for the agent, unresolved by workspaceId ---
      const unread = await request(app.getHttpServer())
        .get(`/notifications/unread?recipientType=AGENT&recipientId=${agentId}`)
        .set("Authorization", `Bearer ${agentToken}`)
        .expect(200);
      expect((unread.body as unknown[]).length).toBeGreaterThan(0);

      // --- Every module's domain event reached the subscribed human client over the SAME realtime channel ---
      await new Promise((resolve) => setTimeout(resolve, 500));
      const eventNames = received.map((e) => e.eventName);
      expect(eventNames).toEqual(
        expect.arrayContaining([
          "task.assigned",
          "task.status_changed",
          "resource_lock.acquired",
          "process.status_changed",
          "decision.recorded",
          "event.recorded",
          "task.completed",
          "goal.progress_changed",
          "notification.sent",
        ]),
      );

      const decisionEvent = received.find((e) => e.eventName === "decision.recorded");
      expect((decisionEvent?.payload as { decisionId: string }).decisionId).toBe(decision.body.id);
    },
    30000,
  );
});
