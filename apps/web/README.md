# `apps/web` — the console, and everything in front of it

Next.js App Router, React 19, Tailwind v4, shadcn (new-york). It talks to `apps/hub`
over HTTP and holds no database of its own.

## Three trees, three audiences

```
app/(public)/   what a stranger may read      — no session, no workspace
app/(auth)/     the door                      — sign in, create an account
app/(console)/  the product                   — everything behind a session
```

They are route groups rather than one gated page, and the reason is concrete: a gate
rendered in place cannot be linked to, cannot be indexed, and gave somebody arriving at
a hub they were handed a link to nothing to read before typing a password into it.

`/sign-in` and `/sign-up` carry `?next=`, so a link to a task survives the detour
through signing in. The value is checked to be a path on this site before it is
followed — an unchecked one turns the form into an open redirect.

## How a session works

Two credentials, and the split is the whole design.

- **The access token** comes back in the login response body and lives in **memory**
  (`lib/hub.ts`). It never touches `localStorage`: a token any script on this origin
  can read turns a single XSS into a full takeover, and this console approves machines.
- **The session cookie** is set by the hub, `httpOnly` and scoped to `/auth`, so this
  code cannot read it either. It buys a new access token and does nothing else.

So a reload has no token and one call to `/auth/refresh` gets it back. The hub rotates
the cookie on every use and treats a replayed one as theft — see
`apps/hub/src/modules/identity/doc.md`.

Two consequences worth knowing before changing anything here:

- Requests are sent with `credentials: "include"`, and a 401 triggers **one** renewal
  and **one** replay of the original request. Concurrent 401s share a single in-flight
  renewal — five parallel refreshes would each rotate the cookie, four would present a
  spent one, and the hub would correctly read that as a stolen credential and sign the
  person out.
- `(console)/layout.tsx` renders nothing until the restore attempt has answered.
  Rendering the console early would flash data that may not be ours; rendering the door
  early would flash a form at somebody who is already signed in.

## State

- `useSession` — who is signed in and which workspace is chosen. In memory.
- `usePreferences` — page size, whether the organization sits in the workspace rail,
  and the last workspace opened. In `localStorage`, because none of it is a secret;
  rehydrated after the first paint so the server-rendered HTML and the first client
  render agree.

## Running it

```bash
npm run dev --workspace=web      # http://localhost:3003
```

Needs a hub. Point at it with `NEXT_PUBLIC_HUB_URL` (default `http://localhost:8765`),
read at build time on purpose — a console that could be told its own API address by a
URL parameter is CVE-2026-25253. The hub must list this origin in `CORS_ORIGINS`, or
signing in is refused before it starts.
