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
- **§18.4 / §7.9 Spawn safety.** Never a shell, arguments as a list, an
  environment built from nothing rather than inherited, and a working
  directory that cannot escape its workspace.

## What it does not do yet

Receiving and executing orders (§6.8: `ExecuteTask`, `CreateWorktree`,
`InvokeTool`…). Those are commands **addressed to** a worker, and the hub has
no command queue yet. The two pieces that will need to be right when it does —
how a process is launched, and how its failure is read — are written and
tested here already.

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
