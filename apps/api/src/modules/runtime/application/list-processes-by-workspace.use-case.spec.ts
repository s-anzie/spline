import { Process } from "../domain/process";
import { ListProcessesByWorkspaceUseCase } from "./list-processes-by-workspace.use-case";
import { InMemoryProcessRepository } from "./testing/in-memory-process.repository";

describe("ListProcessesByWorkspaceUseCase", () => {
  it("lists processes scoped to a workspace", async () => {
    const processes = new InMemoryProcessRepository();
    await processes.save(Process.create({ workspaceId: "w1", name: "A", command: "npm run dev", cwd: "." }));
    await processes.save(Process.create({ workspaceId: "w2", name: "B", command: "npm run dev", cwd: "." }));
    const useCase = new ListProcessesByWorkspaceUseCase(processes);

    const found = await useCase.execute("w1");

    expect(found.map((p) => p.name)).toEqual(["A"]);
  });
});
