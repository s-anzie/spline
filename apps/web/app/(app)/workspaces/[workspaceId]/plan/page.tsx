import { IntegratedPlan } from "@/features/planning/integrated-plan";

export default async function PlanPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return <IntegratedPlan workspaceId={workspaceId}/>;
}
