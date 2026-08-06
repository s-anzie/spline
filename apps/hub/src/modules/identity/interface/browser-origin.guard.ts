import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

/**
 * §18 — the routes that authenticate with a COOKIE need a second check that
 * bearer routes do not.
 *
 * A cookie is attached by the browser automatically, so any page on the
 * internet can make a visitor's browser POST to `/auth/refresh`. CORS stops
 * that page from READING the answer, which is why this is not a token leak —
 * but the rotation still happens, and the real session dies. That is a
 * one-request denial of service against every signed-in user, triggerable
 * from an ad frame.
 *
 * So these routes answer only to the origins the console is served from — the
 * same list CORS already uses, because maintaining two lists is maintaining
 * one list and one mistake. A request with no `Origin` at all is refused too:
 * every browser sends it on a cross-origin POST, and the callers that do not
 * (a worker, a script) have no business here.
 *
 * Not a replacement for CORS. CORS decides what a browser may read; this
 * decides what the server will do at all.
 */
function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function originOf(context: ExecutionContext): string | undefined {
  return context.switchToHttp().getRequest<Request>().headers.origin;
}

/** For the routes that authenticate with the cookie: a browser, or nothing. */
@Injectable()
export class BrowserOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const allowed = allowedOrigins();
    if (allowed.length === 0) {
      throw new ForbiddenException(
        "No browser origin is configured on this hub, so no browser session " +
          "can be refreshed. Set CORS_ORIGINS to the console's address.",
      );
    }
    const origin = originOf(context);
    if (!origin || !allowed.includes(origin)) {
      throw new ForbiddenException(
        "This route only answers the console it was configured for",
      );
    }
    return true;
  }
}

/**
 * For routes that a browser MAY call but a script may too — signing in.
 *
 * Login is authenticated by a password, so it does not need the strict rule
 * above, and applying it would lock out every legitimate non-browser client:
 * a deployment script, a CLI, an integration test. What it does need is the
 * other half — a page on another site must not be able to make a visitor's
 * browser sign in as SOMEBODY ELSE, because the session cookie that comes
 * back would then quietly become the visitor's session.
 *
 * So: an `Origin` that is present and not ours is refused; an absent one is
 * allowed. Every browser sends the header on a cross-origin POST, which is
 * exactly the case being blocked, and no browser omits it there — so nothing
 * that this rule lets through came from the attack it exists to stop.
 */
@Injectable()
export class ForeignOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const origin = originOf(context);
    if (origin && !allowedOrigins().includes(origin)) {
      throw new ForbiddenException(
        "This hub does not serve the page you are calling from",
      );
    }
    return true;
  }
}
