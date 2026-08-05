# worker

The Spline Worker Runtime (v3 §6-7): the component installed **on a machine**.
The hub decides; this executes.

## What it does today

- **§6.3 Pairing.** A machine with no credential asks to join, prints a
  short-lived code on **its own console**, and waits for the owner of an
  organization to approve that code from the hub. Reading the code off this
  screen is what makes approving it proof that you can see this machine — a
  factor no amount of network access gives. The credential is minted when the
  machine collects it, so no plaintext token ever waits at rest.
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

## Carrying out an order (§6.8)

The loop is pull → execute → report, one order at a time: two at once would
share a workspace directory, and §7.9's file isolation is per workspace.

The payload is **attacker-influenced input** — an agent's text reached it
somewhere upstream — so nothing in it is trusted with anything structural:

- the working directory is derived from the order's `workspaceId`, never taken
  from the payload; a payload that could name its root could name another
  workspace's (§6.10)
- the program goes through this machine's allowlist
- the environment goes through the same refusals as any other spawn
- an order type this worker does not know is refused **by name**, not guessed
  at: §6.8 lets an Engine or Extension add its own, and interpreting an
  unknown one would be inventing a contract

A non-zero exit code is reported as a **completed** order carrying that code,
not as a failure. The program ran and said what it had to say; what that means
is the hub's to decide (§6.9), and reporting FAILED would throw away the exit
code and the output.

## Driving a coding agent (§7.1, §4.8)

An order that names a **provider** is an agent run: it carries a prompt rather
than a command line, and its answer is a session and a result rather than an
exit code. Dispatched on the payload rather than on a second order type —
§6.8's types say WHAT to do, not WITH WHAT, and `ExecuteTaskWithClaude` would
mean a new type per provider.

Each provider is described by one object (`provider-spec.ts`): how to start
it, how to resume it, how to read what it said. Adding a third is data, not a
branch in the executor. The shape is taken from OpenClaw's CLI backends, which
solved the same problem.

| | claude | codex |
| --- | --- | --- |
| Start | `-p <prompt> --output-format json` | `exec --json <prompt>` |
| Session id | **assigned** by us (`--session-id`) | reported by it (`thread.started`) |
| Resume | `--resume <id>` | `exec resume <id>` — a subcommand, not a flag |
| Output | one JSON envelope | JSONL event stream |

**Where a CLI accepts an assigned session id, we assign it**, and that is a
deliberate improvement on capturing it from the output. Capture-only — the
only mechanism OpenClaw has — means a run that dies between the spawn and the
parse can never be resumed, because nobody ever learned what to resume. Codex
cannot be told, so there the id is read from the stream and that difference is
carried rather than flattened: a shared abstraction that hid it would be
lying about what it can do.

Output that is not the expected shape is a **broken run**, never a result to
guess at (§7.15). Inventing one would hand the hub a fact nobody produced.

## What it does not do yet

**Secrets.** `secretsFor` returns nothing, because the hub has no route that
grants a task its secrets yet (§18.4) — so a real `claude` would run without a
credential. An empty set is the honest answer; a spread of this process's
environment would be the dishonest one. **This is the next thing that has to
land for an agent to actually run.**

**The bridge from a Task to an order.** Nothing turns "this task is assigned
to this agent" into a `RuntimeCommand` carrying a prompt. The worker can drive
an agent; the hub does not yet ask it to.

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

On a machine that has never paired, leave `WORKER_TOKEN` empty: the daemon
prints a pairing code and waits. `WORKER_TOKEN` exists for a machine
provisioned by configuration management, which skips pairing entirely.

Three things will stop it starting, on purpose: a `HUB_URL` that is plain
`http` to anything but loopback (the token would travel in clear), running as
root, and a credential file readable beyond its owner — both the `.env` and
the identity file this daemon writes for itself. `WORKER_ALLOWED_COMMANDS` is
empty in the example, which means this machine refuses every order that asks
it to run a program — that is the intended default, not an oversight.

To actually run tasks you also need `CONTAINER_IMAGE`. Without it the
container backend refuses rather than falling back to the host: falling back
would turn a missing setting into a silently removed boundary.
