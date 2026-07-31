import { LocalMachine } from "../domain/local-machine";
import { ListMachinesByWorkspaceUseCase } from "./list-machines-by-workspace.use-case";
import { InMemoryLocalMachineRepository } from "./testing/in-memory-local-machine.repository";

describe("ListMachinesByWorkspaceUseCase", () => {
  it("lists machines linked to a workspace", async () => {
    const machines = new InMemoryLocalMachineRepository();
    const linked = LocalMachine.register({ hostname: "linked", os: "linux" });
    linked.linkToWorkspace("w1");
    await machines.save(linked);
    const unlinked = LocalMachine.register({ hostname: "unlinked", os: "linux" });
    await machines.save(unlinked);
    const useCase = new ListMachinesByWorkspaceUseCase(machines);

    const found = await useCase.execute("w1");

    expect(found.map((m) => m.hostname)).toEqual(["linked"]);
  });
});
