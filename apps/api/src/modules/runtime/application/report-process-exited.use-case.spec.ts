import { ProcessStatus } from "@repo/db";

import { Process } from "../domain/process";
import { ProcessNotFoundError } from "./runtime-application.errors";
import { ReportProcessExitedUseCase } from "./report-process-exited.use-case";
import { InMemoryProcessRepository } from "./testing/in-memory-process.repository";

function runningProcess() {
  const process = Process.create({ workspaceId: "w1", name: "Dev server", command: "npm run dev", cwd: "." });
  process.changeStatus(ProcessStatus.STARTING);
  process.recordPid(4242);
  process.changeStatus(ProcessStatus.RUNNING);
  return process;
}

describe("ReportProcessExitedUseCase", () => {
  it("moves STOPPING -> STOPPED when the exit was requested", async () => {
    const processes = new InMemoryProcessRepository();
    const process = runningProcess();
    process.changeStatus(ProcessStatus.STOPPING);
    await processes.save(process);
    const useCase = new ReportProcessExitedUseCase(processes);

    const result = await useCase.execute({ processId: process.id.toString(), exitCode: 0 });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(ProcessStatus.STOPPED);
    expect(result.value.pid).toBeUndefined();
  });

  it("moves RUNNING -> CRASHED when the process exits on its own", async () => {
    const processes = new InMemoryProcessRepository();
    const process = runningProcess();
    await processes.save(process);
    const useCase = new ReportProcessExitedUseCase(processes);

    const result = await useCase.execute({ processId: process.id.toString(), exitCode: 1 });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(ProcessStatus.CRASHED);
  });

  it("fails when the process does not exist", async () => {
    const useCase = new ReportProcessExitedUseCase(new InMemoryProcessRepository());

    const result = await useCase.execute({ processId: "unknown", exitCode: 0 });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ProcessNotFoundError);
  });
});
