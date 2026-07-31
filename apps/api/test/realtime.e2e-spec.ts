import { AddressInfo } from "node:net";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { Test } from "@nestjs/testing";
import { io, Socket } from "socket.io-client";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Realtime (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  const openSockets: Socket[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useWebSocketAdapter(new IoAdapter(app));
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

  async function registerAndLogin(email: string): Promise<string> {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email, password: "correct-horse", displayName: email })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "correct-horse" })
      .expect(200);
    return login.body.token as string;
  }

  function connect(auth: Record<string, unknown>): Socket {
    const socket = io(baseUrl, { auth, transports: ["websocket"], forceNew: true });
    openSockets.push(socket);
    return socket;
  }

  it(
    "disconnects a socket that presents no token",
    async () => {
      const socket = connect({});

      // The socket.io transport handshake completes ("connect") before the
      // server-side handleConnection() has run and rejected it — the actual
      // assertion is that a "disconnect" follows shortly after.
      await new Promise<void>((resolve, reject) => {
        socket.on("disconnect", () => resolve());
        setTimeout(() => reject(new Error("timed out waiting for disconnect")), 4000);
      });
    },
    10000,
  );

  it(
    "joins the workspace room and relays a workspace.archived event",
    async () => {
      const token = await registerAndLogin("realtime@example.com");
      const created = await request(app.getHttpServer())
        .post("/workspaces")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Realtime workspace" })
        .expect(201);

      const socket = connect({ token });
      await new Promise<void>((resolve, reject) => {
        socket.on("connect", () => resolve());
        socket.on("connect_error", reject);
      });

      const eventReceived = new Promise((resolve) => {
        socket.on("workspace.archived", resolve);
      });

      await request(app.getHttpServer())
        .post(`/workspaces/${created.body.id}/archive`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const payload = (await eventReceived) as { workspaceId: string };
      expect(payload.workspaceId).toBe(created.body.id);
    },
    10000,
  );

  it(
    "does not deliver events for a workspace the socket has no access to",
    async () => {
      const ownerToken = await registerAndLogin("owner-rt@example.com");
      const strangerToken = await registerAndLogin("stranger-rt@example.com");
      const created = await request(app.getHttpServer())
        .post("/workspaces")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Private realtime workspace" })
        .expect(201);

      const strangerSocket = connect({ token: strangerToken });
      await new Promise<void>((resolve, reject) => {
        strangerSocket.on("connect", () => resolve());
        strangerSocket.on("connect_error", reject);
      });

      const receivedEvents: unknown[] = [];
      strangerSocket.on("workspace.archived", (payload: unknown) => receivedEvents.push(payload));

      await request(app.getHttpServer())
        .post(`/workspaces/${created.body.id}/archive`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(201);

      // give the (absent) relay a moment; it should never arrive.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(receivedEvents).toHaveLength(0);
    },
    10000,
  );
});
