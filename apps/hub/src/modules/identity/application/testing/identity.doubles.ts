import { ActorRef } from "../../domain/actor";
import { ActorCredential } from "../../domain/actor-credential";
import { Organization } from "../../domain/organization";
import { WorkspaceRole } from "../../domain/permission-matrix";
import {
  ActorCredentialRepository,
  OrganizationRepository,
  UserRepository,
  WorkspaceMembershipRepository,
} from "../../domain/ports/identity.repository.ports";
import {
  HumanTokenPayload,
  PasswordHasher,
  SecretGenerator,
  TokenSigner,
} from "../../domain/ports/identity.service.ports";
import { User } from "../../domain/user";
import { WorkspaceMembership } from "../../domain/workspace-membership";

export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, User>();

  async save(user: User): Promise<void> {
    this.users.set(user.id.value, user);
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email.value === email) return user;
    }
    return null;
  }
}

export class InMemoryOrganizationRepository implements OrganizationRepository {
  readonly organizations = new Map<string, Organization>();

  async save(organization: Organization): Promise<void> {
    this.organizations.set(organization.id.value, organization);
  }

  async findById(id: string): Promise<Organization | null> {
    return this.organizations.get(id) ?? null;
  }

  async listByOwnerId(ownerId: string): Promise<Organization[]> {
    return [...this.organizations.values()].filter((o) => o.ownerId === ownerId);
  }
}

export class InMemoryWorkspaceMembershipRepository
  implements WorkspaceMembershipRepository
{
  readonly memberships = new Map<string, WorkspaceMembership>();

  async save(membership: WorkspaceMembership): Promise<void> {
    this.memberships.set(membership.id.value, membership);
  }

  async findById(id: string): Promise<WorkspaceMembership | null> {
    return this.memberships.get(id) ?? null;
  }

  async findByActorAndWorkspace(
    actor: ActorRef,
    workspaceId: string,
  ): Promise<WorkspaceMembership | null> {
    for (const membership of this.memberships.values()) {
      if (membership.workspaceId === workspaceId && membership.actor.equals(actor)) {
        return membership;
      }
    }
    return null;
  }

  async listByWorkspace(workspaceId: string): Promise<WorkspaceMembership[]> {
    return [...this.memberships.values()].filter((m) => m.workspaceId === workspaceId);
  }

  async listByActor(actor: ActorRef): Promise<WorkspaceMembership[]> {
    return [...this.memberships.values()].filter((m) => m.actor.equals(actor));
  }

  async countByWorkspaceAndRole(
    workspaceId: string,
    role: WorkspaceRole,
  ): Promise<number> {
    return (await this.listByWorkspace(workspaceId)).filter((m) => m.role === role)
      .length;
  }

  async delete(id: string): Promise<void> {
    this.memberships.delete(id);
  }
}

export class InMemoryActorCredentialRepository implements ActorCredentialRepository {
  readonly credentials = new Map<string, ActorCredential>();

  async save(credential: ActorCredential): Promise<void> {
    this.credentials.set(credential.id.value, credential);
  }

  async findById(id: string): Promise<ActorCredential | null> {
    return this.credentials.get(id) ?? null;
  }

  async listByActor(actor: ActorRef): Promise<ActorCredential[]> {
    return [...this.credentials.values()].filter((c) => c.actor.equals(actor));
  }

  async listByOrganization(organizationId: string): Promise<ActorCredential[]> {
    return [...this.credentials.values()].filter((c) =>
      c.belongsTo(organizationId),
    );
  }
}

/** Reversible fake: hash("x") = "hashed:x" — deterministic, no crypto cost. */
export class FakePasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plain}`;
  }
}

export class FakeTokenSigner implements TokenSigner {
  async sign(payload: HumanTokenPayload): Promise<string> {
    return `jwt:${payload.sub}`;
  }

  async verify(token: string): Promise<HumanTokenPayload | null> {
    if (!token.startsWith("jwt:")) return null;
    return { sub: token.slice(4), actorType: "HUMAN" };
  }
}

export class FakeSecretGenerator implements SecretGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `secret-${this.counter}`;
  }
}
