import { UnauthorizedException } from "@nestjs/common";
import { ActorType } from "@repo/db";

import { extractRequester } from "./current-requester.decorator";
import { RequestWithRequester } from "./authenticated-requester";

describe("extractRequester", () => {
  it("returns the requester attached by JwtAuthGuard", () => {
    const request = { requester: { type: ActorType.HUMAN, id: "user-1" } } as RequestWithRequester;

    expect(extractRequester(request)).toEqual({ type: ActorType.HUMAN, id: "user-1" });
  });

  it("throws if called before JwtAuthGuard ran", () => {
    const request = {} as RequestWithRequester;

    expect(() => extractRequester(request)).toThrow(UnauthorizedException);
  });
});
