import { Event } from "../../src/modules/event/domain/event";
import { EventReceipt } from "../../src/modules/event/domain/event-receipt";
import { PrismaEventRepository } from "../../src/modules/event/infrastructure/prisma-event.repository";
import { PrismaEventReceiptRepository } from "../../src/modules/event/infrastructure/prisma-event-receipt.repository";
import { PrismaService } from "../../src/prisma/prisma.service";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };
const AGENT_2 = { type: "AGENT" as const, id: "agent-2" };

describe("PrismaEventReceiptRepository (integration)", () => {
  let prisma: PrismaService;
  let events: PrismaEventRepository;
  let repository: PrismaEventReceiptRepository;
  let workspaceId: string;
  let eventId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    events = new PrismaEventRepository(prisma);
    repository = new PrismaEventReceiptRepository(prisma);
  });

  beforeEach(async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Test workspace" } });
    workspaceId = workspace.id;
    const event = Event.record({ workspaceId, type: "agent.validation_request", actor: HUMAN_1 });
    await events.save(event);
    eventId = event.id.toString();
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a receipt and finds it back by (event, actor)", async () => {
    const receipt = EventReceipt.mark({ eventId, actor: AGENT_1, status: "SEEN" });
    await repository.save(receipt);

    const found = await repository.findByEventAndActor(eventId, "AGENT", "agent-1");

    expect(found?.status).toBe("SEEN");
    expect(found?.seenAt).not.toBeNull();
  });

  it("returns null when no receipt exists yet for that actor", async () => {
    await expect(repository.findByEventAndActor(eventId, "AGENT", "agent-1")).resolves.toBeNull();
  });

  it("reproduces the broadcast/partial-ack scenario: 2 recipients, only one acknowledges", async () => {
    await repository.save(EventReceipt.mark({ eventId, actor: AGENT_1, status: "ACKNOWLEDGED" }));
    await repository.save(EventReceipt.mark({ eventId, actor: AGENT_2, status: "SEEN" }));

    const all = await repository.listByEvent(eventId);

    expect(all).toHaveLength(2);
    const acked = all.find((r) => r.actorId === "agent-1");
    const notYetAcked = all.find((r) => r.actorId === "agent-2");
    expect(acked?.status).toBe("ACKNOWLEDGED");
    expect(notYetAcked?.status).toBe("SEEN");
    expect(notYetAcked?.acknowledgedAt).toBeUndefined();
  });

  it("persists an advanced status (save is an upsert keyed by receipt id)", async () => {
    const receipt = EventReceipt.mark({ eventId, actor: AGENT_1, status: "SEEN" });
    await repository.save(receipt);

    receipt.advanceTo("ACKNOWLEDGED");
    await repository.save(receipt);

    const found = await repository.findByEventAndActor(eventId, "AGENT", "agent-1");
    expect(found?.status).toBe("ACKNOWLEDGED");
    expect(found?.seenAt).not.toBeNull();
    expect(found?.acknowledgedAt).not.toBeNull();
  });
});
