# @repo/api — Spline hub (control plane)

NestJS + PostgreSQL (Prisma) backend for Spline, a multi-agent orchestration/supervision
platform. This is the **hub**: it owns all persisted state, RBAC, and the WebSocket
control channel that dispatches work to one or more `apps/runtime` daemons running on
workspace machines.

## Architecture

Every business module under `src/modules/<name>/` follows the same 4-layer clean
architecture, dependencies pointing inward only (`interface → infrastructure →
application → domain`):

- **`domain/`** — entities (`AggregateRoot`/`Entity`), value objects, domain errors,
  domain events. No NestJS/Prisma imports.
- **`application/`** — one use-case per operation, returning `Result<T, E>` for expected
  failures rather than throwing. Depends only on domain ports (interfaces).
- **`infrastructure/`** — `Prisma<Name>Repository` implementations + mappers
  (`toDomain`/`toPersistence`).
- **`interface/`** — REST controllers, `class-validator` DTOs, the module's NestJS
  wiring (`<name>.module.ts`).

Domain events are published through a generic `EventPublisher` port (backed by
`EventEmitter2`) and relayed to WebSocket clients by `RealtimeGateway`, which subscribes
once to `@OnEvent("**")` — no module needs to know about WebSockets to be realtime-visible.

### Modules

| Module | Owns |
|---|---|
| `identity` | Users, `WorkspaceMembership`, RBAC (8 permissions × 6 roles), JWT auth, opaque agent/machine tokens |
| `workspace` | Workspace lifecycle, membership, ruleset, filesystem root path |
| `goal` | Goals, auto progress recalculation on task completion |
| `task` | Tasks, single explicit assignee, status/validation state machines |
| `agent` | Agent registration/presence, `ProviderProfile` catalog |
| `resource-lock` | Polymorphic locks (process/task/workspace-ruleset), actor-match release, lazy TTL expiry |
| `runtime` | `LocalMachine`, `AgentSession`, `Process`, `RuntimeCommand` queue, `MachineGateway` (the `/machines` WebSocket namespace `apps/runtime` connects to) |
| `artifact` | Versioned business objects (files, notes, diffs...) linked to goals/tasks/decisions |
| `decision` | Immutable trace of a decision made by an agent or human |
| `event` | System journal (`Event`) + per-actor acknowledgement (`EventReceipt`) |
| `notification` | Unified chat message / system alert (`Notification` + `NotificationRecipient`, resolved per-recipient at send time) |

### Two WebSocket surfaces

- `RealtimeGateway` (namespace `/`) — human/agent clients, JWT-authenticated, relays every
  domain event to the room for the workspaces they belong to.
- `MachineGateway` (namespace `/machines`) — machine daemons (`apps/runtime`), authenticated
  with an opaque `machine_<id>.<secret>` token, dispatches `RuntimeCommand`s and ingests
  process/session reports. See `src/modules/runtime/interface/machine.gateway.ts` for the
  exact wire contract.

## Provisioning PostgreSQL

Postgres runs natively on this machine (port 5433). Create a dedicated low-privilege role
and two databases:

```sql
CREATE ROLE spline WITH LOGIN PASSWORD '<generated password>';
CREATE DATABASE spline_dev  OWNER spline;
CREATE DATABASE spline_test OWNER spline;
```

## Environment

Copy `.env.example` to `.env` and fill in the generated password / a random JWT secret:

```
PORT=8765
DATABASE_URL="postgresql://spline:<password>@localhost:5433/spline_dev"
DATABASE_URL_TEST="postgresql://spline:<password>@localhost:5433/spline_test"
JWT_SECRET="<generate a long random secret>"
JWT_EXPIRES_IN="1h"
```

`packages/database` (`@repo/db`) ships a pre-built CJS `dist/` — after any
`prisma/schema.prisma` change, run `npm run build --workspace=@repo/db` (not just
`prisma generate`) so the compiled client picks it up.

## Running

From the repo root:

```sh
npx turbo dev --filter=api        # nest start --watch
npx turbo test --filter=api       # unit tests (fast, no DB)
npx turbo test:e2e --filter=api   # e2e + integration tests against spline_test (real Postgres)
npx turbo check-types --filter=api
npx turbo lint --filter=api
```

`test/scenarios/collaboration-flow.e2e-spec.ts` is the broadest single test: it drives a
full Workspace → Goal → Task → Agent → ResourceLock → Process (via a simulated
`apps/runtime` machine over the real `/machines` WebSocket) → Decision → Event →
Notification loop, with a human WebSocket client subscribed throughout, asserting every
module's domain events actually reach a live realtime subscriber.

## Companion daemon

`apps/runtime` is a separate, non-NestJS Node process that connects outbound to
`MachineGateway`, executes `START_PROCESS`/`STOP_PROCESS`/`START_SESSION`/`STOP_SESSION`
commands via real `child_process` (Claude/Codex CLI sessions or arbitrary workspace
commands), and reports results back. See `apps/runtime/README.md`.
