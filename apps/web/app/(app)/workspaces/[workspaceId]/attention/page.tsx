import { WorkspaceInterventions } from "@/features/workspaces/workspace-interventions";

export default async function WorkspaceAttentionPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <WorkspaceInterventions workspaceId={workspaceId} />;
}
