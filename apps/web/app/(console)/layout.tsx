"use client";

import { useSession } from "@/lib/store";
import { Shell } from "@/components/shell";
import { SignIn } from "@/components/sign-in";
import { WorkspacePicker } from "@/components/workspace-picker";

/**
 * The gate every console page sits behind: signed in, and a workspace chosen.
 *
 * Both gates render IN PLACE rather than redirecting. The access token lives
 * in memory (see `lib/hub.ts`), so a hard load of `/runs/abc` has no session —
 * but bouncing to `/sign-in` would throw away the address somebody was sent.
 * Signing in here leaves the URL alone, and the page underneath renders the
 * moment there is a session to render it with.
 */
export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email, workspaceId } = useSession();

  if (!email) {
    return <SignIn />;
  }

  return (
    <Shell>{workspaceId ? children : <WorkspacePicker />}</Shell>
  );
}
