This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## What this console is for

OpenClaw's own conclusion about their Control UI is the one worth taking:
it became *"a place to triage, intervene and keep useful agent interfaces
alive, rather than merely watch"*. So the first screen is not a dashboard of
charts — it is **what needs you**:

| Entry | Why it is there |
| --- | --- |
| a machine waiting to be paired | somebody is physically waiting, code in hand (§6.3) |
| a run in `VALIDATING` | an agent never declares its own success (§11) |
| a blocked task | an obstacle it cannot resolve alone (§4.22) |
| an actor gone quiet | §9.16 — from an empty queue, "up to date" and "abandoned" look identical |
| an order claimed and never reported | §17.7 |

An empty list **says so**, rather than looking abandoned. And every entry
carries its reason, never a status word alone (§17.8) — "3 things need you" is
not something anybody can act on.

## Two decisions worth knowing

**The token lives in memory, never in `localStorage`.** A token in local
storage is a token any script on the origin can read, which turns one XSS into
a session takeover — and this console approves machines. In memory it dies
with the tab, which costs a login on reload and is worth it.

**The hub's address is a build-time value, never a URL parameter.** A console
that could be told its own API address by a query string is CVE-2026-25253:
OpenClaw's Control UI trusted a `gatewayUrl` parameter and leaked the operator
token to whoever supplied it.

Set `NEXT_PUBLIC_HUB_URL`, and list this origin in the hub's `CORS_ORIGINS` —
the hub allows no browser origin by default.
