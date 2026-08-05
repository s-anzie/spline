import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §18.4, §18.7 — the credentials a workspace holds, and the single path by
 * which one ever reaches a machine.
 *
 * The properties that matter here are all negative: what must NOT happen. A
 * value must not appear in a read route, must not sit in a command row, must
 * not reach a worker that does not hold the order, and must not be readable
 * out of the database by anyone who can read the database.
 */
describe("Secrets (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const VALUE = "sk-ant-a-real-looking-credential";

  async function setup() {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email: "o@example.com", password: "a-strong-password", displayName: "O" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: "o@example.com", password: "a-strong-password" })
      .expect(200);
    const auth = (r: request.Test) =>
      r.set("Authorization", `Bearer ${logged.body.accessToken}`);
    const ws = await auth(request(http).post("/workspaces"))
      .send({ organizationId: registered.body.organizationId, name: "Core" })
      .expect(201);
    const workspaceId = ws.body.workspaceId as string;

    const worker = await auth(request(http).post("/runtime/workers"))
      .send({ hostname: "workshop-01", architecture: "x86_64", operatingSystem: "linux" })
      .expect(201);
    const workerId = worker.body.workerId as string;
    await auth(request(http).post(`/workspaces/${workspaceId}/runtime/workers`))
      .send({ workerId })
      .expect(200);

    return { auth, workspaceId, workerId, base: `/workspaces/${workspaceId}/secrets` };
  }

  it("stores a secret and lists it by name, never by value", async () => {
    const ctx = await setup();

    const stored = await ctx
      .auth(request(http).post(ctx.base))
      .send({ name: "ANTHROPIC_API_KEY", value: VALUE })
      .expect(200);
    expect(stored.body).toEqual({ name: "ANTHROPIC_API_KEY", rotated: false });

    const listed = await ctx.auth(request(http).get(ctx.base)).expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].name).toBe("ANTHROPIC_API_KEY");
    // The property this whole module exists for.
    expect(JSON.stringify(listed.body)).not.toContain(VALUE);
  });

  /**
   * The row is what an attacker with database access reads, and what ends up
   * in every backup. It must not carry the value.
   */
  it("keeps nothing readable in the row", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(ctx.base))
      .send({ name: "ANTHROPIC_API_KEY", value: VALUE })
      .expect(200);

    const row = await prisma.secret.findFirst({ where: { name: "ANTHROPIC_API_KEY" } });

    expect(row?.sealed).not.toContain(VALUE);
    expect(row?.sealed.startsWith("v1.")).toBe(true);
  });

  it("rotates on the same name rather than adding a second", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(ctx.base))
      .send({ name: "ANTHROPIC_API_KEY", value: VALUE })
      .expect(200);

    const rotated = await ctx
      .auth(request(http).post(ctx.base))
      .send({ name: "ANTHROPIC_API_KEY", value: "sk-ant-the-new-one" })
      .expect(200);

    expect(rotated.body.rotated).toBe(true);
    expect(await prisma.secret.count({ where: { name: "ANTHROPIC_API_KEY" } })).toBe(1);
  });

  it("refuses a name that could not be an environment variable", async () => {
    const ctx = await setup();

    for (const name of ["lowercase", "HAS-DASH", "HAS=EQUALS", "1STARTS_WITH_DIGIT"]) {
      await ctx.auth(request(http).post(ctx.base)).send({ name, value: VALUE }).expect(400);
    }
  });

  it("deletes physically, because a credential's history is not wanted", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(ctx.base))
      .send({ name: "ANTHROPIC_API_KEY", value: VALUE })
      .expect(200);

    await ctx
      .auth(request(http).delete(`${ctx.base}/ANTHROPIC_API_KEY`))
      .expect(200);

    expect(await prisma.secret.count()).toBe(0);
  });

  /**
   * §18.4 — the one path out. A worker asks while HOLDING the order, and gets
   * only what the order declared.
   */
  describe("reaching a worker", () => {
    async function withClaimedCommand(ctx: Awaited<ReturnType<typeof setup>>, secretNames: string[]) {
      await ctx
        .auth(request(http).post(ctx.base))
        .send({ name: "ANTHROPIC_API_KEY", value: VALUE })
        .expect(200);
      await ctx
        .auth(request(http).post(ctx.base))
        .send({ name: "OTHER_KEY", value: "not-for-this-task" })
        .expect(200);

      const command = await ctx
        .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/commands`))
        .send({
          workerId: ctx.workerId,
          type: "ExecuteTask",
          payload: { provider: "claude", prompt: "go", secretNames },
        })
        .expect(201);
      await ctx
        .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
        .send({})
        .expect(200);
      return command.body.commandId as string;
    }

    it("hands over exactly what the order declared", async () => {
      const ctx = await setup();
      const commandId = await withClaimedCommand(ctx, ["ANTHROPIC_API_KEY"]);

      const secrets = await ctx
        .auth(
          request(http).post(
            `/runtime/workers/${ctx.workerId}/commands/${commandId}/secrets`,
          ),
        )
        .expect(200);

      expect(secrets.body).toEqual({ ANTHROPIC_API_KEY: VALUE });
      // The one it did not declare stays where it is.
      expect(secrets.body).not.toHaveProperty("OTHER_KEY");
    });

    /**
     * The names come from the ORDER, so a worker cannot widen its own grant.
     * The request body carries nothing at all, which is what makes that true
     * by construction rather than by validation.
     */
    it("gives nothing to an order that declared nothing", async () => {
      const ctx = await setup();
      const commandId = await withClaimedCommand(ctx, []);

      const secrets = await ctx
        .auth(
          request(http).post(
            `/runtime/workers/${ctx.workerId}/commands/${commandId}/secrets`,
          ),
        )
        .expect(200);

      expect(secrets.body).toEqual({});
    });

    it("refuses a machine that does not hold the order", async () => {
      const ctx = await setup();
      await ctx
        .auth(request(http).post(ctx.base))
        .send({ name: "ANTHROPIC_API_KEY", value: VALUE })
        .expect(200);
      const command = await ctx
        .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/commands`))
        .send({
          workerId: ctx.workerId,
          type: "ExecuteTask",
          payload: { secretNames: ["ANTHROPIC_API_KEY"] },
        })
        .expect(201);

      // Never claimed: holding the order is what entitles a machine to its
      // credentials.
      await ctx
        .auth(
          request(http).post(
            `/runtime/workers/${ctx.workerId}/commands/${command.body.commandId}/secrets`,
          ),
        )
        .expect(403);
    });

    /**
     * All or nothing. A run that started with half its credentials fails deep
     * inside a provider, with a message about authentication that points
     * nowhere near the configuration that is actually wrong.
     */
    it("refuses the whole set when one name is missing, and names which", async () => {
      const ctx = await setup();
      const commandId = await withClaimedCommand(ctx, [
        "ANTHROPIC_API_KEY",
        "NOT_CONFIGURED",
      ]);

      const refused = await ctx
        .auth(
          request(http).post(
            `/runtime/workers/${ctx.workerId}/commands/${commandId}/secrets`,
          ),
        )
        .expect(400);

      expect(refused.body.message).toContain("NOT_CONFIGURED");
      expect(refused.body.message).not.toContain(VALUE);
    });

    /** §18.7 — reading a secret is an act, and acts are recorded. */
    it("records the access without recording the value", async () => {
      const ctx = await setup();
      const commandId = await withClaimedCommand(ctx, ["ANTHROPIC_API_KEY"]);

      await ctx
        .auth(
          request(http).post(
            `/runtime/workers/${ctx.workerId}/commands/${commandId}/secrets`,
          ),
        )
        .expect(200);

      const accessed = await prisma.event.findFirst({
        where: { type: "secret.accessed" },
      });
      expect(accessed).not.toBeNull();
      // `sequence` is a BigInt, which JSON.stringify refuses — so the search
      // is over the fields that could plausibly carry a value.
      expect(
        JSON.stringify({ ...accessed, sequence: undefined }),
      ).not.toContain(VALUE);

      const row = await prisma.secret.findFirst({
        where: { name: "ANTHROPIC_API_KEY" },
      });
      expect(row?.lastAccessedAt).not.toBeNull();
    });
  });

  /** §4.2 — one workspace's credentials are never another's. */
  it("does not resolve a secret across workspaces", async () => {
    const mine = await setup();
    await mine
      .auth(request(http).post(mine.base))
      .send({ name: "ANTHROPIC_API_KEY", value: VALUE })
      .expect(200);

    const other = await mine
      .auth(request(http).post("/workspaces"))
      .send({
        organizationId: (
          await prisma.workspace.findUniqueOrThrow({ where: { id: mine.workspaceId } })
        ).organizationId,
        name: "Other",
      })
      .expect(201);

    const listed = await mine
      .auth(request(http).get(`/workspaces/${other.body.workspaceId}/secrets`))
      .expect(200);

    expect(listed.body).toEqual([]);
  });
});
