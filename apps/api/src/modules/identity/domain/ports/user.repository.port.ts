import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { User } from "../user";

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");

export interface UserRepository {
  findById(id: UniqueEntityId): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
