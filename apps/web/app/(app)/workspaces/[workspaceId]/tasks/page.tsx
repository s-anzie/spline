import { IntegratedTasks } from "@/features/planning/integrated-tasks";
export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const [{ workspaceId }, { task }] = await Promise.all([params, searchParams]);
  return <IntegratedTasks workspaceId={workspaceId} initialTaskId={task} />;
}
