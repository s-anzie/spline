import { Policy, PolicyScopeType, PolicyType } from "../policy";

export interface ListPoliciesFilter {
  /** Mandatory (§4.2): there is no unscoped listing. */
  workspaceId: string;
  type?: PolicyType;
  scopeType?: PolicyScopeType;
  includeDisabled?: boolean;
}

export interface PolicyRepository {
  save(policy: Policy): Promise<void>;
  findById(id: string): Promise<Policy | null>;
  /** One rule at one scope — the uniqueness the schema enforces. */
  findAtScope(
    workspaceId: string,
    scopeType: PolicyScopeType,
    scopeId: string,
    rule: string,
  ): Promise<Policy | null>;
  list(filter: ListPoliciesFilter): Promise<Policy[]>;
}
export const POLICY_REPOSITORY = "policy/PolicyRepository";
