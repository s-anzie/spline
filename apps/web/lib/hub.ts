/**
 * The one place this console talks to the hub.
 *
 * Everything about the shape here follows from one decision: **the access
 * token is held in memory, never in `localStorage`**. A token in local
 * storage is a token any script on the origin can read, which turns a single
 * XSS into a full session takeover — and this console can approve machines
 * and read secrets' names.
 *
 * What used to follow from that was a reload signing you out. It no longer
 * does: the hub also hands the browser an httpOnly cookie the console itself
 * cannot read, good for exactly one thing — buying a new access token. So the
 * token that matters still dies with the tab, and the thing that survives it
 * can do nothing on its own.
 */

export interface HubError {
  status: number;
  message: string;
}

export type HubResult<T> =
  | { ok: true; value: T; error?: undefined }
  | { ok: false; error: HubError; value?: undefined };

/**
 * Where the hub lives. Read at build time, because a console that could be
 * told its own API address by a URL parameter is CVE-2026-25253 — OpenClaw's
 * Control UI trusted a `gatewayUrl` parameter and leaked the token to
 * whoever supplied it.
 */
const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:8765";

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

/**
 * Where the session cookie is allowed to travel. It is scoped to `/auth` by
 * the hub, so nothing else would carry it anyway — this list is what stops
 * the retry below from trying to refresh a refresh.
 */
const AUTH_PATHS = ["/auth/refresh", "/auth/logout", "/auth/login", "/auth/register"];

/**
 * How the console gets a new access token when the one it holds has expired.
 *
 * Set by the session store rather than imported from it: this module is the
 * bottom of the stack and importing the store would make the two circular.
 */
let renew: (() => Promise<boolean>) | null = null;

export function setTokenRenewal(renewal: (() => Promise<boolean>) | null): void {
  renew = renewal;
}

/**
 * One renewal at a time.
 *
 * A screen that fires five requests when its token has just expired would
 * otherwise start five refreshes — and since every refresh ROTATES the
 * cookie, four of them would present a credential the first one had already
 * spent. The hub reads that as theft, correctly, and signs the person out.
 * Sharing one in-flight promise is what makes concurrent 401s safe.
 */
let renewing: Promise<boolean> | null = null;

async function renewOnce(): Promise<boolean> {
  renewing ??= (async () => {
    try {
      return renew ? await renew() : false;
    } finally {
      renewing = null;
    }
  })();
  return renewing;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retrying = false,
): Promise<HubResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${HUB_URL}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      // The session cookie, on the routes it is scoped to. Everything else
      // still authenticates with the bearer header and nothing else — a
      // cookie that travelled everywhere would be a cookie in every log.
      credentials: "include",
      // §18 — the hub is where it was configured. A redirect is somebody else
      // saying where to send the credential.
      redirect: "error",
    });
  } catch {
    return {
      ok: false,
      error: {
        status: 0,
        message:
          "The hub could not be reached. It listens on loopback by default — check it is running, and that this origin is listed in CORS_ORIGINS.",
      },
    };
  }

  /**
   * An expired access token is not an error worth showing anybody.
   *
   * The token lasts an hour and this console sits open all day, so the FIRST
   * thing a returning user does is usually hit that wall. One renewal, one
   * replay of the same request, and they never learn it happened. Guarded
   * against looping: the auth routes are excluded, and a retry never retries.
   */
  if (response.status === 401 && !retrying && !AUTH_PATHS.includes(path)) {
    if (await renewOnce()) {
      return request<T>(method, path, body, true);
    }
  }

  const text = await response.text();
  const parsed: unknown = text ? safeJson(text) : null;

  if (!response.ok) {
    return {
      ok: false,
      error: {
        status: response.status,
        // The hub's own refusals say what would have worked (§20.6). Showing
        // ours instead would throw that away.
        message: messageOf(parsed) ?? response.statusText,
      },
    };
  }
  return { ok: true, value: parsed as T };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function messageOf(parsed: unknown): string | null {
  if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
    const message = (parsed as { message: unknown }).message;
    return Array.isArray(message) ? message.join(", ") : String(message);
  }
  return null;
}

export const hub = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path),
};
