import { GoalDetail } from "@/components/screens/goals";

export const metadata = { title: "Goal · Spline" };

export default async function GoalPage({
  params,
}: {
  params: Promise<{ goalId: string }>;
}) {
  const { goalId } = await params;
  return <GoalDetail goalId={goalId} />;
}
