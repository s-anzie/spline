import { RunDetail } from "@/components/screens/runs";

export const metadata = { title: "Run · Spline" };

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <RunDetail runId={runId} />;
}
