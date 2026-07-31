export type KillProbeFn = (pid: number, signal: 0) => void;

/**
 * OS-level liveness probe: process.kill(pid, 0) sends no signal, only checks
 * the target exists. EPERM means it exists but we lack permission to signal
 * it — still alive. Any other error (ESRCH) means it's gone.
 */
export function isProcessAlive(pid: number, killFn: KillProbeFn = process.kill.bind(process)): boolean {
  try {
    killFn(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
