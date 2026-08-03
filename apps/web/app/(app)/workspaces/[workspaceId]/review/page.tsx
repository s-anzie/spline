import { ReviewView } from "@/features/planning/review-view";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const [{ workspaceId }, { item }] = await Promise.all([params, searchParams]);
  return <ReviewView workspaceId={workspaceId} initialItemId={item} />;
}
