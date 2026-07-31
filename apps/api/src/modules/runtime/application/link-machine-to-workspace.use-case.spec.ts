import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { Workspace } from "../../workspace/domain/workspace";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { LocalMachine } from "../domain/local-machine";
import { MachineNotFoundError } from "./runtime-application.errors";
import { LinkMachineToWorkspaceUseCase } from "./link-machine-to-workspace.use-case";
import { InMemoryLocalMachineRepository } from "./testing/in-memory-local-machine.repository";

function setup() {
  const machines = new InMemoryLocalMachineRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const eventPublisher = new FakeEventPublisher();
  const useCase = new LinkMachineToWorkspaceUseCase(
    machines,
    new GetWorkspaceUseCase(workspaces),
    eventPublisher,
  );
  return { machines, workspaces, eventPublisher, useCase };
}

describe("LinkMachineToWorkspaceUseCase", () => {
  it("links a machine to a workspace and publishes the event", async () => {
    const { machines, workspaces, eventPublisher, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);
    const machine = LocalMachine.register({ hostname: "bradley-dev", os: "linux" });
    await machines.save(machine);

    const result = await useCase.execute({
      machineId: machine.id.toString(),
      workspaceId: workspace.id.toString(),
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.workspaceIds).toEqual([workspace.id.toString()]);
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual([
      "local_machine.linked_to_workspace",
    ]);
  });

  it("fails when the workspace does not exist", async () => {
    const { machines, useCase } = setup();
    const machine = LocalMachine.register({ hostname: "bradley-dev", os: "linux" });
    await machines.save(machine);

    const result = await useCase.execute({ machineId: machine.id.toString(), workspaceId: "unknown" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails when the machine does not exist", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({ machineId: "unknown", workspaceId: workspace.id.toString() });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(MachineNotFoundError);
  });
});
