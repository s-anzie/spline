/**
 * "Ces seuils sont des paramètres du système, documentés et ajustables"
 * (§17.7). "Ajustable" already has an owner here: the Policy Engine, which
 * §12.1 makes responsible for limits. Observability owns the need, policy
 * owns the rule — so the port is declared here and supplied there.
 */
export interface StalenessThresholdsPort {
  /** The workspace's value for a rule, or null when it sets none. */
  thresholdMsFor(workspaceId: string, rule: string): Promise<number | null>;
}
export const STALENESS_THRESHOLDS = "observability/StalenessThresholdsPort";
