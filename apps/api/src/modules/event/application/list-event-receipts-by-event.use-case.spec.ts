import { EventReceipt } from "../domain/event-receipt";
import { InMemoryEventReceiptRepository } from "./testing/in-memory-event-receipt.repository";
import { ListEventReceiptsByEventUseCase } from "./list-event-receipts-by-event.use-case";

const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };
const AGENT_2 = { type: "AGENT" as const, id: "agent-2" };

describe("ListEventReceiptsByEventUseCase", () => {
  it("reproduces the broadcast/partial-ack scenario: 2 recipients, only one acknowledges", async () => {
    const receipts = new InMemoryEventReceiptRepository();
    await receipts.save(EventReceipt.mark({ eventId: "event-1", actor: AGENT_1, status: "SEEN" }));
    await receipts.save(EventReceipt.mark({ eventId: "event-1", actor: AGENT_2, status: "ACKNOWLEDGED" }));
    await receipts.save(EventReceipt.mark({ eventId: "event-2", actor: AGENT_1, status: "SEEN" }));
    const useCase = new ListEventReceiptsByEventUseCase(receipts);

    const result = await useCase.execute("event-1");

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.actorId === "agent-1")?.status).toBe("SEEN");
    expect(result.find((r) => r.actorId === "agent-2")?.status).toBe("ACKNOWLEDGED");
  });
});
