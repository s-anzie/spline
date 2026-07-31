import { User as PrismaUser } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { User } from "../domain/user";

export class UserMapper {
  static toDomain(record: PrismaUser): User {
    return User.create(
      {
        email: record.email,
        passwordHash: record.passwordHash,
        displayName: record.displayName,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(user: User): PrismaUser {
    return {
      id: user.id.toString(),
      email: user.email,
      passwordHash: user.passwordHash,
      displayName: user.displayName,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
