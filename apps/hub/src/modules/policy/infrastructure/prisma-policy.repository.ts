import { Injectable } from "@nestjs/common";
import { Policy as PolicyRow } from "@repo/db";

import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Policy, PolicyScopeType, PolicyType } from "../domain/policy";
import {
  ListPoliciesFilter,
  PolicyRepository,
} from "../domain/ports/policy.repository.port";

export const PolicyMapper = {
  toDomain(row: PolicyRow): Policy {
    return Policy.reconstitute(
      {
        workspaceId: row.workspaceId,
        scopeType: row.scopeType as PolicyScopeType,
        scopeId: row.scopeId,
        type: row.type as PolicyType,
        rule: row.rule,
        value: row.value,
        enabled: row.enabled,
        createdBy: ActorRef.create(row.createdByType as ActorType, row.createdById).value,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      row.id,
    );
  },
};

@Injectable()
export class PrismaPolicyRepository implements PolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** §5.19 — the whole aggregate, never a hand-picked subset. */
  async save(policy: Policy): Promise<void> {
    const data = {
      workspaceId: policy.workspaceId,
      scopeType: policy.scopeType,
      scopeId: policy.scopeId,
      type: policy.type,
      rule: policy.rule,
      value: policy.value as object,
      enabled: policy.enabled,
      createdByType: policy.createdBy.type,
      createdById: policy.createdBy.actorId,
      createdAt: policy.createdAt,
    };
    await this.prisma.policy.upsert({
      where: { id: policy.id.value },
      create: { id: policy.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<Policy | null> {
    const row = await this.prisma.policy.findUnique({ where: { id } });
    return row ? PolicyMapper.toDomain(row) : null;
  }

  async findAtScope(
    workspaceId: string,
    scopeType: PolicyScopeType,
    scopeId: string,
    rule: string,
  ): Promise<Policy | null> {
    const row = await this.prisma.policy.findUnique({
      where: {
        workspaceId_scopeType_scopeId_rule: { workspaceId, scopeType, scopeId, rule },
      },
    });
    return row ? PolicyMapper.toDomain(row) : null;
  }

  async list(filter: ListPoliciesFilter): Promise<Policy[]> {
    const rows = await this.prisma.policy.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.type && { type: filter.type }),
        ...(filter.scopeType && { scopeType: filter.scopeType }),
        ...(filter.includeDisabled ? {} : { enabled: true }),
      },
      orderBy: [{ scopeType: "asc" }, { rule: "asc" }],
    
      // An absent limit is a page, never the whole table (kernel pagination).
      take: pageSize(filter.limit),
    });
    return rows.map((row) => PolicyMapper.toDomain(row));
  }
}
