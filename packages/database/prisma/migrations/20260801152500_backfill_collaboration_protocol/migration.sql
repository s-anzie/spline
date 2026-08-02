UPDATE "workspaces"
SET "ruleset" = jsonb_set(
  "ruleset"::jsonb,
  '{collaboration}',
  COALESCE("ruleset"::jsonb->'collaboration', '{}'::jsonb) || jsonb_build_object(
    'protocolVersion', 1,
    'autoWakeEnabled', true,
    'wakeIntervalMinutes', 2,
    'managerWakeIntervalMinutes', 2,
    'contributorWakeIntervalMinutes', 2,
    'humanTalksOnlyToManager', true,
    'contributorsEscalateOnlyToManager', true,
    'managerChecksQuestionsBeforePlanning', true,
    'idleAgentsCheckTasksAndEvents', true
  ),
  true
);
