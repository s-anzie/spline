import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §18 — a machine belongs to somebody, from the moment it knocks.
 *
 * The pending list used to be global: `where: { status: "PENDING" }`, with a
 * comment explaining that a machine belongs to no organization until somebody
 * approves it. True, and it made every operator's fleet visible to every
 * other — hostname, operating system, architecture, declared capabilities.
 * Approval always needed the code, so nothing could be STOLEN; but knowing
 * what machines a competitor runs is not nothing, and it is not information
 * this hub has any reason to hand out.
 *
 * So a machine now says which organization it is knocking for. It is listed
 * by that organization and by nobody else, and approving one that named a
 * different organization is refused.
 */
describe("Enrolment tenancy (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;

  const password = "a-strong-password";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    http = app.getHttpServer();
  });

  beforeEach(async () => {
    await resetDatabase(app.get(PrismaService));
  });

  afterAll(async () => {
    await app.close();
  });

  async function owner(email: string) {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email, password, displayName: email })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email, password })
      .expect(200);
    return {
      organizationId: registered.body.organizationId as string,
      token: logged.body.accessToken as string,
    };
  }

  const knock = (organizationId: string | null, hostname: string) =>
    request(http)
      .post("/runtime/enrolments")
      .send({
        deviceId: `device-${hostname}`,
        hostname,
        architecture: "x64",
        operatingSystem: "linux",
        capabilities: ["claude"],
        ...(organizationId ? { organizationId } : {}),
      });

  it("shows a waiting machine to the organization it knocked for, and to nobody else", async () => {
    const mine = await owner("mine@example.com");
    const theirs = await owner("theirs@example.com");

    await knock(mine.organizationId, "my-laptop").expect(201);

    const seenByMe = await request(http)
      .get(`/organizations/${mine.organizationId}/enrolments`)
      .set("Authorization", `Bearer ${mine.token}`)
      .expect(200);
    expect(seenByMe.body).toHaveLength(1);
    expect(seenByMe.body[0].hostname).toBe("my-laptop");

    const seenByThem = await request(http)
      .get(`/organizations/${theirs.organizationId}/enrolments`)
      .set("Authorization", `Bearer ${theirs.token}`)
      .expect(200);
    expect(seenByThem.body).toHaveLength(0);
    expect(JSON.stringify(seenByThem.body)).not.toContain("my-laptop");
  });

  /**
   * Even holding the code — which a shoulder-surfer might — approving a
   * machine that knocked for somebody else is refused. The code proves you
   * can see the machine; it does not make the machine yours.
   */
  it("refuses to approve a machine that knocked for another organization", async () => {
    const mine = await owner("mine@example.com");
    const theirs = await owner("theirs@example.com");

    const asked = await knock(mine.organizationId, "my-laptop").expect(201);

    await request(http)
      .post(`/organizations/${theirs.organizationId}/enrolments/decide`)
      .set("Authorization", `Bearer ${theirs.token}`)
      .send({ code: asked.body.code, approve: true })
      .expect(403);

    await request(http)
      .post(`/organizations/${mine.organizationId}/enrolments/decide`)
      .set("Authorization", `Bearer ${mine.token}`)
      .send({ code: asked.body.code, approve: true })
      .expect(200);
  });

  /**
   * A machine that names nobody is listed by nobody. That is the secure
   * default and it is not a dead end: the operator sets the organization on
   * the machine, restarts it, and it appears where it belongs.
   */
  it("lists a machine that named no organization to nobody at all", async () => {
    const mine = await owner("mine@example.com");
    await knock(null, "anonymous-box").expect(201);

    const seen = await request(http)
      .get(`/organizations/${mine.organizationId}/enrolments`)
      .set("Authorization", `Bearer ${mine.token}`)
      .expect(200);
    expect(seen.body).toHaveLength(0);
  });
});
