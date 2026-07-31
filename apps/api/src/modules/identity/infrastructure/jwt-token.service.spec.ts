import { JwtService } from "@nestjs/jwt";

import { JwtTokenService } from "./jwt-token.service";

describe("JwtTokenService", () => {
  function setup(): JwtTokenService {
    const jwtService = new JwtService({ secret: "test-secret", signOptions: { expiresIn: "1h" } });
    return new JwtTokenService(jwtService);
  }

  it("signs claims and verifies them back", () => {
    const service = setup();

    const token = service.sign({ sub: "user-1", kind: "user" });
    const claims = service.verify(token);

    expect(claims).toEqual(
      expect.objectContaining({ sub: "user-1", kind: "user", iat: expect.any(Number), exp: expect.any(Number) }),
    );
  });

  it("throws when verifying a token signed with a different secret", () => {
    const service = setup();
    const otherService = new JwtTokenService(
      new JwtService({ secret: "other-secret", signOptions: { expiresIn: "1h" } }),
    );
    const token = otherService.sign({ sub: "user-1", kind: "user" });

    expect(() => service.verify(token)).toThrow();
  });

  it("throws when verifying garbage", () => {
    const service = setup();

    expect(() => service.verify("not-a-jwt")).toThrow();
  });
});
