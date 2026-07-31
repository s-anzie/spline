import { ProcessStatus } from "@repo/db";

import { Process } from "../domain/process";
import { ProcessNotFoundError } from "./runtime-application.errors";
import { ReportProcessStartedUseCase } from "./report-process-started.use-case";
import { InMemoryProcessRepository } from "./testing/in-memory-process.repository";

describe("ReportProcessStartedUseCase", () => {
  it("records the pid and moves STARTING -> RUNNING", async () => {
    const processes = new InMemoryProcessRepository();
    const process = Process.create({ workspaceId: "w1", name: "Dev server", command: "npm run dev", cwd: "." });
    process.changeStatus(ProcessStatus.STARTING);
    await processes.save(process);
    const useCase = new ReportProcessStartedUseCase(processes);

    const result = await useCase.execute({ processId: process.id.toString(), pid: 4242 });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(ProcessStatus.RUNNING);
    expect(result.value.pid).toBe(4242);
  });

  it("self-heals through STARTING when the report arrives straight from STOPPED (restart flow)", async () => {
    const processes = new InMemoryProcessRepository();
    const process = Process.create({ workspaceId: "w1", name: "Dev server", command: "npm run dev", cwd: "." });
    await processes.save(process);
    const useCase = new ReportProcessStartedUseCase(processes);

    const result = await useCase.execute({ processId: process.id.toString(), pid: 4242 });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(ProcessStatus.RUNNING);
  });

  it("is idempotent when a duplicate report arrives after the process is already RUNNING", async () => {
    const processes = new InMemoryProcessRepository();
    const process = Process.create({ workspaceId: "w1", name: "Dev server", command: "npm run dev", cwd: "." });
    process.changeStatus(ProcessStatus.STARTING);
    process.recordPid(1111);
    process.changeStatus(ProcessStatus.RUNNING);
    await processes.save(process);
    const useCase = new ReportProcessStartedUseCase(processes);

    const result = await useCase.execute({ processId: process.id.toString(), pid: 1111 });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(ProcessStatus.RUNNING);
  });

  it("fails when the process does not exist", async () => {
    const useCase = new ReportProcessStartedUseCase(new InMemoryProcessRepository());

    const result = await useCase.execute({ processId: "unknown", pid: 4242 });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ProcessNotFoundError);
  });
});
