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
- **§18.1 / §18.4 / §7.9 Execution safety.** See the next section — it is the
  part of this daemon most worth reading before changing anything.

## What isolation this actually gives you

**A process cannot confine itself.** Everything below is discipline, not a
boundary, and the distinction matters: read as a sandbox, this list would
promise something it does not deliver. Each line closes a class of escape that
has been exploited in a comparable agent runtime.

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

**What it does NOT give you, and needs a kernel boundary — container, VM, or a
provider sandbox:**

- **The TOCTOU race.** The directory checked can be swapped between the check
  and the spawn. No amount of re-checking from inside the process closes it;
  the kernel has to hold the descriptor.
- **The network.** An allowed task can reach the internet and take with it
  whatever it read.
- **The rest of the disk.** The working directory is constrained; reading
  elsewhere is not.
- **Resources.** No memory, CPU or descriptor limits.
- **The denylist itself.** A list of forbidden variables enumerates the known.
  A boundary does not enumerate.

So: **a task whose content is not trusted must run behind a kernel boundary**,
and the content an agent reads is never trusted (spec §18.12). Until this
daemon provides one, what it offers is defence in depth, not isolation.

## What it does not do yet

Executing orders. The hub has a command queue (§6.8) and this daemon claims
from it, but declines every order rather than running it: wiring an executor
before the payload shapes are settled would guess at them. The pieces that
have to be right when it lands — `planSpawn`, `superviseProcess`,
`detectProviderFailure` — are written and tested here already.

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
