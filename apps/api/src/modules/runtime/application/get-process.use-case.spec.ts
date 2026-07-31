import { Process } from "../domain/process";
import { ProcessNotFoundError } from "./runtime-application.errors";
import { GetProcessUseCase } from "./get-process.use-case";
import { InMemoryProcessRepository } from "./testing/in-memory-process.repository";

describe("GetProcessUseCase", () => {
  it("returns the process when it exists", async () => {
    const processes = new InMemoryProcessRepository();
    const process = Process.create({ workspaceId: "w1", name: "Dev server", command: "npm run dev", cwd: "." });
    await processes.save(process);
    const useCase = new GetProcessUseCase(processes);

    const result = await useCase.execute(process.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.name).toBe("Dev server");
  });

  it("fails when the process does not exist", async () => {
    const useCase = new GetProcessUseCase(new InMemoryProcessRepository());

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ProcessNotFoundError);
  });
});
