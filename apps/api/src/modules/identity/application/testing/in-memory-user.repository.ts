import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { UserRepository } from "../../domain/ports/user.repository.port";
import { User } from "../../domain/user";

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async findById(id: UniqueEntityId): Promise<User | null> {
    return this.users.get(id.toString()) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email === normalized) {
        return user;
      }
    }
    return null;
  }

  async save(user: User): Promise<void> {
    this.users.set(user.id.toString(), user);
  }
}
