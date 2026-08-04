import { Organization } from "./organization";

const now = new Date("2026-08-04T10:00:00.000Z");

describe("Organization", () => {
  it("creates with a slug derived from the name", () => {
    const result = Organization.create({ name: "Bradley's Space", ownerId: "u-1", now });

    expect(result.isSuccess).toBe(true);
    expect(result.value.name).toBe("Bradley's Space");
    expect(result.value.slug).toBe("bradley-s-space");
    expect(result.value.ownerId).toBe("u-1");
    expect(result.value.domainEvents[0]?.eventName).toBe("identity.organization_created");
  });

  it("collapses consecutive separators and trims edge dashes in the slug", () => {
    const organization = Organization.create({ name: "  A  --  B!  ", ownerId: "u-1", now });

    expect(organization.value.slug).toBe("a-b");
  });

  it("rejects an empty name, owner, or a name that slugifies to nothing", () => {
    expect(Organization.create({ name: " ", ownerId: "u-1", now }).isFailure).toBe(true);
    expect(Organization.create({ name: "Org", ownerId: "", now }).isFailure).toBe(true);
    expect(Organization.create({ name: "###", ownerId: "u-1", now }).isFailure).toBe(true);
  });

  it("reconstitute keeps the stored slug and raises no events", () => {
    const organization = Organization.reconstitute(
      { name: "Org", slug: "org", ownerId: "u-1", createdAt: now },
      "org-1",
    );

    expect(organization.slug).toBe("org");
    expect(organization.domainEvents).toHaveLength(0);
  });
});
