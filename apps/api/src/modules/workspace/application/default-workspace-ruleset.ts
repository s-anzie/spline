export const DEFAULT_WORKSPACE_RULESET: Record<string, unknown> = {
  metadata: { schemaVersion: 1, profile: "general", managedDefaults: true },
  governance: {
    humanAuthority: "final",
    requireExplicitApprovalFor: [
      "destructive_actions",
      "credential_or_permission_changes",
      "production_changes",
      "external_messages",
      "financial_commitments",
      "scope_expansion",
    ],
    recordMaterialDecisions: true,
    preserveExistingUserWork: true,
    neverInventAuthorization: true,
  },
  focus: {
    oneWorkspaceAtATime: true,
    oneAccountableOwnerPerTask: true,
    limitWorkInProgress: true,
    finishBeforeExpandingScope: true,
  },
  execution: {
    cycle: [
      "sync",
      "check",
      "claim",
      "act",
      "validate",
      "report",
      "release",
      "await",
    ],
    syncBeforeActing: true,
    requireResourceLockBeforeMutation: true,
    declareIntentBeforeCriticalAction: true,
    useSmallReversibleSteps: true,
    reportBlockersImmediately: true,
    releaseLocksAfterCompletion: true,
  },
  filesystem: {
    enforceWorkspaceRoot: true,
    denyTraversalOutsideRoot: true,
    preserveUnrelatedChanges: true,
    preferAtomicWrites: true,
    destructiveOperationsRequireApproval: true,
  },
  processes: {
    requireLockBeforeStartStopOrRestart: true,
    spawnWithoutShell: true,
    useExplicitArguments: true,
    useMinimalEnvironment: true,
    reportPidAndExitCode: true,
    reconcileAfterRuntimeRestart: true,
  },
  quality: {
    inspectBeforeEditing: true,
    validateChangedBehavior: true,
    requiredChecks: ["types", "lint", "focused_tests"],
    integrationChecksWhenRelevant: true,
    neverDisableChecksToPass: true,
    completionRequiresEvidence: true,
    documentResidualRisk: true,
  },
  security: {
    neverExposeSecrets: true,
    neverPersistPlaintextCredentials: true,
    useLeastPrivilege: true,
    redactSensitiveOutput: true,
    rotateExposedCredentials: true,
    validateExternalInput: true,
  },
  collaboration: {
    protocolVersion: 1,
    autoWakeEnabled: true,
    wakeIntervalMinutes: 2,
    managerWakeIntervalMinutes: 2,
    contributorWakeIntervalMinutes: 2,
    humanTalksOnlyToManager: true,
    contributorsEscalateOnlyToManager: true,
    managerChecksQuestionsBeforePlanning: true,
    idleAgentsCheckTasksAndEvents: true,
    avoidDuplicateWork: true,
    respectOwnershipAndLocks: true,
    explicitHandoffs: true,
    includeAcceptanceCriteriaInDelegation: true,
    escalateConflictingInstructions: true,
  },
  communication: {
    leadWithOutcome: true,
    distinguishFactsInferencesAndRisks: true,
    statusFields: [
      "type",
      "workspace_id",
      "task_id",
      "target",
      "action",
      "status",
      "summary",
      "evidence",
      "blockers",
      "next_step",
    ],
    conciseRoutineUpdates: true,
    detailedFailureAndDecisionReports: true,
  },
  artifacts: {
    versionMaterialOutputs: true,
    linkArtifactsToWorkItems: true,
    includeProvenance: true,
    includeValidationEvidence: true,
    archiveInsteadOfDeleteWhenPossible: true,
  },
  failureRecovery: {
    failSafely: true,
    preserveDiagnostics: true,
    retryOnlyIdempotentOperations: true,
    useBoundedRetries: true,
    markStaleExecutionAsCrashed: true,
    requireHumanDecisionAfterRepeatedFailure: true,
  },
  observability: {
    emitLifecycleEvents: true,
    heartbeatRequiredForActiveRuntime: true,
    trackLastSeen: true,
    retainDecisionHistory: true,
    retainExecutionHistory: true,
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function withDefaultWorkspaceRuleset(
  current?: Record<string, unknown>,
): Record<string, unknown> {
  const merge = (
    defaults: Record<string, unknown>,
    overrides: Record<string, unknown>,
  ): Record<string, unknown> => {
    const result = structuredClone(overrides);
    for (const [key, value] of Object.entries(defaults)) {
      result[key] =
        isObject(value) && isObject(overrides[key])
          ? merge(value, overrides[key])
          : key in overrides
            ? overrides[key]
            : structuredClone(value);
    }
    return result;
  };
  return merge(DEFAULT_WORKSPACE_RULESET, current ?? {});
}

export function workspaceRulesetNeedsBackfill(
  current: Record<string, unknown>,
): boolean {
  const missing = (
    defaults: Record<string, unknown>,
    value: Record<string, unknown>,
  ): boolean =>
    Object.entries(defaults).some(
      ([key, defaultValue]) =>
        !(key in value) ||
        (isObject(defaultValue) &&
          isObject(value[key]) &&
          missing(defaultValue, value[key])),
    );
  return missing(DEFAULT_WORKSPACE_RULESET, current);
}
