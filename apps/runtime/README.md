# @repo/runtime — Spline local machine daemon

A small, standalone Node/TypeScript process (deliberately not NestJS — a single-purpose
daemon gets little value from DI/decorators) that runs on a workspace machine, connects
**outbound** to the Spline hub (`apps/api`), and executes the commands it's given: start
or stop an arbitrary workspace process, or start/stop a Claude/Codex CLI agent session.

Connecting outbound (rather than the hub connecting in) avoids needing an open inbound
port on a developer's machine.

## How it fits together

```
apps/api (hub)  <--- socket.io, /machines namespace --->  apps/runtime (this daemon)
  MachineGateway                                            HubConnection
```

1. `HubConnection` connects to `<HUB_URL>/machines` with a `machine_<id>.<secret>` token
   (issued by `POST /machines` on the hub) and sends a `machine_heartbeat` periodically.
2. Commands pushed by the hub (`command` event: `START_PROCESS` / `STOP_PROCESS` /
   `START_SESSION` / `STOP_SESSION`) are routed by `CommandDispatcher` to either:
   - `ProcessSupervisor` + `GenericCommandRunner` — tokenizes `Process.command` with
     `shell-quote` and spawns it directly (**never** `spawn(..., { shell: true })`,
     **never** a naive whitespace split), or
   - `SessionSupervisor` + a `ProviderAdapter` (`ClaudeProviderAdapter` / `CodexProviderAdapter`)
     — spawns the real `claude`/`codex` CLI in non-interactive mode.
3. Results are reported back over the same socket (`process_started`, `process_exited`,
   `session_status`, `session_heartbeat`), which the hub turns into domain events relayed
   to any subscribed human/agent clients.

## Security invariants

- Every spawn passes an argv array, never a shell string.
- The child's env is an explicit minimal set (`PATH`, `HOME`, plus whatever the caller
  supplies) — **never** a spread of this daemon's own `process.env`.
- `ClaudeProviderAdapter` writes the prompt to the child's stdin rather than argv, to stay
  under the OS `ARG_MAX` limit on large system prompts (verified against `claude --help`
  on a real machine, not guessed).

## Environment

```
HUB_URL=http://localhost:8765
MACHINE_TOKEN=machine_<credentialId>.<secret>   # from POST /machines on the hub
HEARTBEAT_INTERVAL_MS=15000                     # optional, defaults to 15000
```

## Running

From the repo root:

```sh
npx turbo dev --filter=runtime          # ts-node src/main.ts
npx turbo build --filter=runtime
npx turbo test --filter=runtime         # unit tests, all spawn/socket dependencies faked
npx turbo check-types --filter=runtime
npx turbo lint --filter=runtime
```

`src/provider-adapters/cli-availability.smoke.spec.ts` is a real (unmocked) smoke test:
it actually invokes `claude --version` / `codex --version` if that binary is present on
the machine's `PATH`, and skips gracefully if not — proof the daemon can really launch
these CLIs, not just that the mocks behave. No automated test launches a real prompted
session (cost, latency, filesystem side effects outside test isolation).
