import { LocalMachineRuntimeStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { LocalMachine } from "../domain/local-machine";
import { MachineNotFoundError } from "./runtime-application.errors";
import { UpdateMachinePresenceUseCase } from "./update-machine-presence.use-case";
import { InMemoryLocalMachineRepository } from "./testing/in-memory-local-machine.repository";

describe("UpdateMachinePresenceUseCase", () => {
  it("marks an OFFLINE machine ONLINE on connect", async () => {
    const machines = new InMemoryLocalMachineRepository();
    const machine = LocalMachine.register({ hostname: "bradley-dev", os: "linux" });
    await machines.save(machine);
    const useCase = new UpdateMachinePresenceUseCase(machines, new FakeEventPublisher());

    await useCase.execute({ machineId: machine.id.toString(), connected: true });

    const found = await machines.findById(machine.id);
    expect(found?.runtimeStatus).toBe(LocalMachineRuntimeStatus.ONLINE);
  });

  it("is idempotent: connecting an already-ONLINE machine does not throw", async () => {
    const machines = new InMemoryLocalMachineRepository();
    const machine = LocalMachine.register({ hostname: "bradley-dev", os: "linux" });
    machine.changeRuntimeStatus(LocalMachineRuntimeStatus.ONLINE);
    await machines.save(machine);
    const useCase = new UpdateMachinePresenceUseCase(machines, new FakeEventPublisher());

    const result = await useCase.execute({ machineId: machine.id.toString(), connected: true });

    expect(result.isSuccess).toBe(true);
  });

  it("refreshes lastSeenAt on every heartbeat, even while already ONLINE", async () => {
    const machines = new InMemoryLocalMachineRepository();
    const machine = LocalMachine.register({ hostname: "bradley-dev", os: "linux" });
    machine.changeRuntimeStatus(LocalMachineRuntimeStatus.ONLINE, new Date("2026-08-01T00:00:00Z"));
    await machines.save(machine);
    const useCase = new UpdateMachinePresenceUseCase(machines, new FakeEventPublisher());
    const later = new Date("2026-08-02T00:00:00Z");

    await useCase.execute({ machineId: machine.id.toString(), connected: true }, later);

    const found = await machines.findById(machine.id);
    expect(found?.lastSeenAt).toEqual(later);
  });

  it("marks an ONLINE machine OFFLINE on disconnect", async () => {
    const machines = new InMemoryLocalMachineRepository();
    const machine = LocalMachine.register({ hostname: "bradley-dev", os: "linux" });
    machine.changeRuntimeStatus(LocalMachineRuntimeStatus.ONLINE);
    await machines.save(machine);
    const useCase = new UpdateMachinePresenceUseCase(machines, new FakeEventPublisher());

    await useCase.execute({ machineId: machine.id.toString(), connected: false });

    const found = await machines.findById(machine.id);
    expect(found?.runtimeStatus).toBe(LocalMachineRuntimeStatus.OFFLINE);
  });

  it("fails when the machine does not exist", async () => {
    const useCase = new UpdateMachinePresenceUseCase(
      new InMemoryLocalMachineRepository(),
      new FakeEventPublisher(),
    );

    const result = await useCase.execute({ machineId: "unknown", connected: true });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(MachineNotFoundError);
  });
});
