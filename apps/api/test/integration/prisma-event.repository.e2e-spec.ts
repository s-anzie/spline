import { Event } from "../../src/modules/event/domain/event";
import { PrismaEventRepository } from "../../src/modules/event/infrastructure/prisma-event.repository";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const SYSTEM_ACTOR = { type: "SYSTEM" as const, id: "boot-reconciliation" };

describe("PrismaEventRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaEventRepository;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaEventRepository(prisma);
  });

  beforeEach(async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Test workspace" } });
    workspaceId = workspace.id;
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists an event with a SYSTEM actor (not part of the strict ActorType enum) and finds it back", async () => {
    const event = Event.record({
      workspaceId,
      type: "process.crashed",
      severity: "CRITICAL",
      actor: SYSTEM_ACTOR,
      target: { type: "process", id: "process-1" },
      payload: { exitCode: 1 },
    });

    await repository.save(event);
    const found = await repository.findById(event.id);

    expect(found?.type).toBe("process.crashed");
    expect(found?.severity).toBe("CRITICAL");
    expect(found?.actor).toEqual(SYSTEM_ACTOR);
    expect(found?.target).toEqual({ type: "process", id: "process-1" });
    expect(found?.payload).toEqual({ exitCode: 1 });
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("lists events scoped to a workspace", async () => {
    await repository.save(Event.record({ workspaceId, type: "agent.intention", actor: HUMAN_1 }));
    const otherWorkspace = await prisma.workspace.create({ data: { name: "Other" } });
    await repository.save(Event.record({ workspaceId: otherWorkspace.id, type: "agent.intention", actor: HUMAN_1 }));

    const found = await repository.listByWorkspace(workspaceId);

    expect(found).toHaveLength(1);
  });
});
