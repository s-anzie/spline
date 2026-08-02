import { HistoryTimeline } from "@/features/records/history-timeline";

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <HistoryTimeline workspaceId={workspaceId} />;
}
