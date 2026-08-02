import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ActorType } from "@repo/db";

import { PermissionsGuard } from "./permissions.guard";
import { RequestWithRequester } from "./authenticated-requester";
import { PERMISSION_METADATA_KEY } from "./require-permission.decorator";
import { SKIP_RESOURCE_CHECK_METADATA_KEY } from "./skip-resource-check.decorator";

function makeContext(request: Partial<RequestWithRequester>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(permission: string | undefined, skipResourceCheck = false) {
  return {
    get: jest.fn((key: string) => {
      if (key === PERMISSION_METADATA_KEY) return permission;
      if (key === SKIP_RESOURCE_CHECK_METADATA_KEY) return skipResourceCheck;
      return undefined;
    }),
  };
}

function makePrisma(resource: unknown = { id: "resource-1" }) {
  const repository = () => ({ findFirst: jest.fn().mockResolvedValue(resource) });
  return {
    goal: repository(),
    task: repository(),
    agent: repository(),
    process: repository(),
    agentSession: repository(),
    resourceLock: repository(),
    artifact: repository(),
    decision: repository(),
    event: repository(),
    notification: repository(),
    agentQuestion: repository(),
    localMachine: repository(),
  };
}

describe("PermissionsGuard", () => {
  it("allows the request through when the route requires no permission", async () => {
    const reflector = makeReflector(undefined);
    const permissionsService = { can: jest.fn() };
    const guard = new PermissionsGuard(
      reflector as never,
      permissionsService as never,
      makePrisma() as never,
    );

    const result = await guard.canActivate(makeContext({ params: {} }));

    expect(result).toBe(true);
    expect(permissionsService.can).not.toHaveBeenCalled();
  });

  it("rejects when there is no authenticated requester", async () => {
    const reflector = makeReflector("read_tasks");
    const permissionsService = { can: jest.fn() };
    const guard = new PermissionsGuard(
      reflector as never,
      permissionsService as never,
      makePrisma() as never,
    );

    await expect(
      guard.canActivate(makeContext({ params: { workspaceId: "w1" } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("allows the request when the requester holds the permission", async () => {
    const reflector = makeReflector("read_tasks");
    const permissionsService = { can: jest.fn().mockResolvedValue(true) };
    const guard = new PermissionsGuard(
      reflector as never,
      permissionsService as never,
      makePrisma() as never,
    );
    const request: Partial<RequestWithRequester> = {
      params: { workspaceId: "w1" },
      requester: { type: ActorType.HUMAN, id: "user-1" },
    };

    const result = await guard.canActivate(makeContext(request));

    expect(result).toBe(true);
    expect(permissionsService.can).toHaveBeenCalledWith(ActorType.HUMAN, "user-1", "w1", "read_tasks");
  });

  it("denies the request when the requester lacks the permission", async () => {
    const reflector = makeReflector("manage_workspace_rules");
    const permissionsService = { can: jest.fn().mockResolvedValue(false) };
    const guard = new PermissionsGuard(
      reflector as never,
      permissionsService as never,
      makePrisma() as never,
    );
    const request: Partial<RequestWithRequester> = {
      params: { workspaceId: "w1" },
      requester: { type: ActorType.HUMAN, id: "user-1" },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
  });

  it("hides a resource identifier that belongs to another workspace", async () => {
    const reflector = makeReflector("read_tasks");
    const permissionsService = { can: jest.fn().mockResolvedValue(true) };
    const prisma = makePrisma(null);
    const guard = new PermissionsGuard(
      reflector as never,
      permissionsService as never,
      prisma as never,
    );
    const request: Partial<RequestWithRequester> = {
      params: { workspaceId: "w1", taskId: "task-from-w2" },
      requester: { type: ActorType.AGENT, id: "agent-1" },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: "task-from-w2", workspaceId: "w1" },
      select: { id: true },
    });
  });

  it("allows a scoped resource that belongs to the route workspace", async () => {
    const reflector = makeReflector("read_tasks");
    const permissionsService = { can: jest.fn().mockResolvedValue(true) };
    const prisma = makePrisma();
    const guard = new PermissionsGuard(
      reflector as never,
      permissionsService as never,
      prisma as never,
    );
    const request: Partial<RequestWithRequester> = {
      params: { workspaceId: "w1", artifactId: "artifact-1" },
      requester: { type: ActorType.AGENT, id: "agent-1" },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(prisma.artifact.findFirst).toHaveBeenCalled();
  });

  it("skips the resource-ownership check when the handler opts out (e.g. linking a machine for the first time)", async () => {
    const reflector = makeReflector("manage_workspace_rules", true);
    const permissionsService = { can: jest.fn().mockResolvedValue(true) };
    const prisma = makePrisma(null); // machine does NOT yet belong to this workspace
    const guard = new PermissionsGuard(
      reflector as never,
      permissionsService as never,
      prisma as never,
    );
    const request: Partial<RequestWithRequester> = {
      params: { workspaceId: "w1", machineId: "not-yet-linked" },
      requester: { type: ActorType.HUMAN, id: "user-1" },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(prisma.localMachine.findFirst).not.toHaveBeenCalled();
  });
});
