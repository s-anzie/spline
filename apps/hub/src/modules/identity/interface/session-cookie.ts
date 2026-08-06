import type { Request, Response } from "express";

/**
 * §18 — everything about the cookie a browser keeps, in one place.
 *
 * Written by hand rather than through `cookie-parser` for a reason the
 * bootstrap file already gives about helmet: an e2e spec builds its app from
 * the module graph and runs none of `main.ts`, so a protection that lives in
 * middleware is a protection no test observes. Reading one header and writing
 * one `Set-Cookie` needs no dependency.
 */
export const SESSION_COOKIE = "spline_session";

/**
 * Only `/auth`. The cookie is useless anywhere else — it buys an access token
 * and names no permission — and a credential that travels on every read of a
 * workspace is a credential in every log and every proxy along the way.
 */
const COOKIE_PATH = "/auth";

/**
 * `lax`, not `strict`: the console and the hub are usually different ports or
 * subdomains of one site, which is same-site, and `strict` would additionally
 * drop the cookie when somebody follows a link into the console from
 * elsewhere. A genuinely cross-site deployment needs `none` plus `secure`,
 * which is why this is configurable rather than assumed.
 */
function sameSite(): "lax" | "strict" | "none" {
  const configured = process.env.SESSION_COOKIE_SAMESITE?.trim().toLowerCase();
  return configured === "strict" || configured === "none" ? configured : "lax";
}

/**
 * Secure unless explicitly told otherwise. Development over plain http on
 * loopback is the one case that needs the exception, and it has to be asked
 * for — a default that turned itself off on a hunch would ship a cookie in
 * the clear the first time a deployment forgot to set something.
 */
function secure(): boolean {
  if (process.env.SESSION_COOKIE_SECURE?.trim() === "false") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

export function setSessionCookie(
  response: Response,
  token: string,
  expiresAt: Date,
): void {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: sameSite(),
    secure: secure(),
    path: COOKIE_PATH,
    expires: expiresAt,
  });
}

/**
 * Cleared with the SAME attributes it was set with. A browser matches a
 * deletion by name, path and domain: clearing it on `/` leaves the real one
 * on `/auth` untouched, and "sign out" silently does nothing.
 */
export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: sameSite(),
    secure: secure(),
    path: COOKIE_PATH,
  });
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 0) {
      continue;
    }
    if (part.slice(0, at).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(at + 1).trim()) || null;
    }
  }
  return null;
}
