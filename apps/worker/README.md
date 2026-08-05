# worker

The Spline Worker Runtime (v3 §6-7): the component installed **on a machine**.
The hub decides; this executes.

## What it does today

- **§6.3 Registration.** Announces hostname, architecture, OS and declared
  capabilities; the hub answers with a worker id. Re-registering the same
  hostname returns the same machine, because a worker that restarts is the
  same worker.
- **§6.4 Heartbeat.** Says "I am here" on an interval. The hub judges whether
  that is recent enough (§17.7) — this daemon never decides it is healthy.
- **§7.15 Failure detection.** Reads **process-level channels only**: stderr,
  exit code, structured tool errors. Never stdout.
- **§18.1 / §18.4 / §18.5 / §7.9 Execution safety.** See the next section — it
  is the part of this daemon most worth reading before changing anything.

## What isolation this actually gives you

Two layers, and the distinction between them is the most important thing in
this file. **A process cannot confine itself**: everything in the first table
is discipline, and each line closes a class of escape that has been exploited
in a comparable agent runtime. The boundary comes after, from the kernel.

| Control | What it closes |
| --- | --- |
| Never a shell; arguments as a list | Injection through text an agent wrote |
| A command is a **name** — not a line, not a path | `sh -c …`, and `/tmp/evil/git` that merely ends in an allowed name |
| **Allowlist, closed by default** — empty runs nothing | An operator who configures nothing silently running everything |
| Environment built from nothing | Leaking this machine's secrets, and other workspaces' (§6.10) |
| Code-loading variables **refused** (`LD_PRELOAD`, `NODE_OPTIONS`, `BASH_ENV`, `GIT_SSH_COMMAND`…) | Walking around the allowlist with no shell at all: the allowed program runs, and loads the attacker's code |
| `PATH` belongs to the machine | An allowed name resolving to a different program |
| Containment judged on the **real** path (`realpath`) | A symlink that leaves the workspace while looking contained |
| Timeout that kills the **process group** | A task that never exits; a child that outlives its own task |
| Output ceiling, reading stops there | Memory exhaustion with no payload |
| Refuses to start as **root** | Everything above being decorative |
| Refuses a token file readable beyond its owner | Credential theft by another account on the machine |

### The boundary the kernel draws

The table above is discipline. This is the part a process genuinely cannot do
for itself, and it is why `EXECUTION_BACKEND=container` is the **default**.

Every task is planned twice: `planSpawn` first — the allowlist and the
environment rules still apply, a container is not a reason to stop checking
what goes into it — then `planContainer` wraps the result in a run that has:

| Flag | Gap it closes |
| --- | --- |
| One bind mount, `--read-only` root, `noexec` tmpfs for `/tmp` | **The rest of the disk**, and **the TOCTOU race**: a symlink inside the workspace now resolves inside the CONTAINER. Its `/etc` is the image's. Winning the race buys nothing, because there is nothing outside to reach. |
| `--network none` | **The network.** Nothing to exfiltrate to. |
| `--memory`, `--memory-swap`, `--cpus`, `--pids-limit` | **Resources.** Swap is pinned to memory, or a task simply swaps past the limit. |
| `--cap-drop ALL`, `--security-opt no-new-privileges`, `--user` | Privilege inside the boundary |
| `--rm` | Anything surviving the task |

Secrets are forwarded **by name** (`--env NAME`), the value travelling in the
runtime's own environment: a value in argv is a value in `ps`, readable by
every account on the machine (§18.4).

`container-plan.integration.spec.ts` proves each row against a real runtime —
including the memory limit with its control, since the same command prints
`SURVIVED` when run without `--memory`. It skips rather than fails where no
runtime is installed.

**What remains open, honestly:**

- **`EXECUTION_BACKEND=host` gives none of this.** It is a deliberate choice,
  logged loudly at every start, and it exists because a machine without a
  container runtime should still be able to register and report.
- **The image is trusted.** Nothing here verifies what `CONTAINER_IMAGE`
  contains; a poisoned image is a poisoned task.
- **The container runtime is trusted**, and the worker talks to its socket.
  A `docker` daemon reachable by this user is root-equivalent on the host —
  rootless Podman is the stronger footing, and the code already accepts it.
- **The denylist of code-loading variables still enumerates the known.** It is
  now redundant with the boundary rather than load-bearing, which is the right
  place for it, but it is still a list.

## What it does not do yet

Executing orders. The hub has a command queue (§6.8) and this daemon claims
from it, but declines every order rather than running it: wiring an executor
before the payload shapes are settled would guess at them. Every piece that
has to be right when it lands is written and tested here already —
`planExecution` (which is the door: `planSpawn`, then `planContainer`),
`superviseProcess`, and `detectProviderFailure`.

## The rule worth knowing before changing anything

`detectProviderFailure` takes `stdout` and never reads it. That is not an
oversight, and deleting the field would hide the decision.

`ProviderProfile` is a **global** catalogue (§4.14): a single false positive
does not inconvenience one agent, it locks out **every** agent on that
provider. An agent writing code that mentions `429`, or explaining a rate
limit to a human, must never be able to do that (0.3.8).

## Running it

```bash
cp .env.example .env   # then set HUB_URL and WORKER_TOKEN
npm run dev --workspace=worker
```

`WORKER_TOKEN` is an actor credential issued by the hub. Capabilities are
declared, never detected: claiming one this machine does not have would
attract work it cannot do (§9.9).

Three things will stop it starting, on purpose: a `HUB_URL` that is plain
`http` to anything but loopback (the token would travel in clear), running as
root, and a `.env` readable beyond its owner. `WORKER_ALLOWED_COMMANDS` is
empty in the example, which means this machine refuses every order that asks
it to run a program — that is the intended default, not an oversight.

To actually run tasks you also need `CONTAINER_IMAGE`. Without it the
container backend refuses rather than falling back to the host: falling back
would turn a missing setting into a silently removed boundary.
