import { TaskDetail } from "@/components/screens/tasks";

export const metadata = { title: "Task · Spline" };

export default async function TaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  return <TaskDetail taskId={taskId} />;
}
