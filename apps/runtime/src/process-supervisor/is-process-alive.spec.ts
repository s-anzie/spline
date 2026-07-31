import { isProcessAlive } from "./is-process-alive";

describe("isProcessAlive", () => {
  it("returns true when process.kill(pid, 0) does not throw", () => {
    const killFn = jest.fn();
    expect(isProcessAlive(4242, killFn)).toBe(true);
    expect(killFn).toHaveBeenCalledWith(4242, 0);
  });

  it("returns true when process.kill throws EPERM (process exists, no permission to signal it)", () => {
    const killFn = jest.fn(() => {
      const error = new Error("EPERM") as NodeJS.ErrnoException;
      error.code = "EPERM";
      throw error;
    });
    expect(isProcessAlive(4242, killFn)).toBe(true);
  });

  it("returns false when process.kill throws ESRCH (no such process)", () => {
    const killFn = jest.fn(() => {
      const error = new Error("ESRCH") as NodeJS.ErrnoException;
      error.code = "ESRCH";
      throw error;
    });
    expect(isProcessAlive(4242, killFn)).toBe(false);
  });

  it("defaults to the real process.kill when no killFn is injected", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });
});
