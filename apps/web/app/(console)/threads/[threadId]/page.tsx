import { ThreadDetail } from "@/components/screens/threads";

export const metadata = { title: "Conversation · Spline" };

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return <ThreadDetail threadId={threadId} />;
}
