import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { GitRunner } from "./checkout";

const run = promisify(execFile);

/**
 * Runs git, and never a shell.
 *
 * `execFile`, not `exec`: arguments stay an array, so a branch name that
 * happens to contain `;` or `$(…)` is a branch name and not a command. Every
 * value reaching here came from a task somebody or something else wrote.
 *
 * The environment is trimmed to what git needs. Two entries are refused on
 * purpose and both are remote-code-execution shaped: `GIT_SSH_COMMAND` makes
 * git run a program of the caller's choosing, and `GIT_EXTERNAL_DIFF` does the
 * same on the next diff. An operator who genuinely needs a custom SSH command
 * configures it on the machine, not through an order.
 *
 * `GIT_TERMINAL_PROMPT=0` because a daemon that stops to ask for a password
 * hangs until its timeout, and the timeout is what an operator then has to
 * debug instead of the missing credential.
 */
export function gitRunner(timeoutMs: number): GitRunner {
  return {
    async run(args, cwd) {
      const { stdout } = await run("git", [...args], {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          PATH: process.env.PATH ?? "",
          // Where the machine's own credentials live: `~/.ssh`, and the
          // credential helper a `~/.gitconfig` may name. Spline carries no
          // credential of its own — if `git clone` works in the operator's
          // shell, it works here, and if it does not, no amount of
          // configuration in Spline would have helped.
          HOME: process.env.HOME ?? "",
          /**
           * The commonest GitHub setup there is: an SSH key with a
           * passphrase, held by `ssh-agent`. Without this the key cannot be
           * used and git answers "Permission denied (publickey)" — a message
           * that sends an operator hunting through their key files for a
           * problem that is not there.
           *
           * It is a socket path, not a secret, and it reaches only git.
           */
          ...(process.env.SSH_AUTH_SOCK
            ? { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK }
            : {}),
          GIT_TERMINAL_PROMPT: "0",
          // Keeps `git commit` from failing on a machine with no global
          // identity — the real author is passed per commit anyway.
          GIT_CONFIG_NOSYSTEM: "1",
        },
      });
      return stdout;
    },
  };
}
