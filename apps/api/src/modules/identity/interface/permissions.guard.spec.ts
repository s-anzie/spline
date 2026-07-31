import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ActorType } from "@repo/db";

import { PermissionsGuard } from "./permissions.guard";
import { RequestWithRequester } from "./authenticated-requester";

function makeContext(request: Partial<RequestWithRequester>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard", () => {
  it("allows the request through when the route requires no permission", async () => {
    const reflector = { get: jest.fn().mockReturnValue(undefined) };
    const permissionsService = { can: jest.fn() };
    const guard = new PermissionsGuard(reflector as never, permissionsService as never);

    const result = await guard.canActivate(makeContext({ params: {} }));

    expect(result).toBe(true);
    expect(permissionsService.can).not.toHaveBeenCalled();
  });

  it("rejects when there is no authenticated requester", async () => {
    const reflector = { get: jest.fn().mockReturnValue("read_tasks") };
    const permissionsService = { can: jest.fn() };
    const guard = new PermissionsGuard(reflector as never, permissionsService as never);

    await expect(
      guard.canActivate(makeContext({ params: { workspaceId: "w1" } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("allows the request when the requester holds the permission", async () => {
    const reflector = { get: jest.fn().mockReturnValue("read_tasks") };
    const permissionsService = { can: jest.fn().mockResolvedValue(true) };
    const guard = new PermissionsGuard(reflector as never, permissionsService as never);
    const request: Partial<RequestWithRequester> = {
      params: { workspaceId: "w1" },
      requester: { type: ActorType.HUMAN, id: "user-1" },
    };

    const result = await guard.canActivate(makeContext(request));

    expect(result).toBe(true);
    expect(permissionsService.can).toHaveBeenCalledWith(ActorType.HUMAN, "user-1", "w1", "read_tasks");
  });

  it("denies the request when the requester lacks the permission", async () => {
    const reflector = { get: jest.fn().mockReturnValue("manage_workspace_rules") };
    const permissionsService = { can: jest.fn().mockResolvedValue(false) };
    const guard = new PermissionsGuard(reflector as never, permissionsService as never);
    const request: Partial<RequestWithRequester> = {
      params: { workspaceId: "w1" },
      requester: { type: ActorType.HUMAN, id: "user-1" },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
  });
});
