import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ActorType } from "@repo/db";

import { JwtAuthGuard } from "./jwt-auth.guard";
import { RequestWithRequester } from "./authenticated-requester";

function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
  const request: Partial<RequestWithRequester> = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("JwtAuthGuard", () => {
  it("rejects a request with no Authorization header", async () => {
    const resolver = { resolve: jest.fn() };
    const guard = new JwtAuthGuard(resolver as never);

    await expect(guard.canActivate(contextWithHeaders({}))).rejects.toThrow(UnauthorizedException);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it("attaches the resolved requester and allows the request through", async () => {
    const resolver = { resolve: jest.fn().mockResolvedValue({ type: ActorType.HUMAN, id: "user-1" }) };
    const guard = new JwtAuthGuard(resolver as never);
    const request: Partial<RequestWithRequester> = { headers: { authorization: "Bearer a.jwt.token" } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(resolver.resolve).toHaveBeenCalledWith("a.jwt.token");
    expect(request.requester).toEqual({ type: ActorType.HUMAN, id: "user-1" });
  });

  it("rejects when the resolver cannot identify the token", async () => {
    const resolver = { resolve: jest.fn().mockResolvedValue(null) };
    const guard = new JwtAuthGuard(resolver as never);

    await expect(
      guard.canActivate(contextWithHeaders({ authorization: "Bearer garbage" })),
    ).rejects.toThrow(UnauthorizedException);
  });
});
