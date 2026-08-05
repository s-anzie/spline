/**
 * The one place this console talks to the hub.
 *
 * Everything about the shape here follows from one decision: **the token is
 * held in memory, never in `localStorage`**. A token in local storage is a
 * token any script on the origin can read, which turns a single XSS into a
 * full session takeover — and this console can approve machines and read
 * secrets' names. In memory it dies with the tab, which costs a login on
 * reload and is worth it.
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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
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
