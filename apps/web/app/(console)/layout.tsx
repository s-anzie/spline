"use client";

import { usePathname } from "next/navigation";

import { isOrganizationLevel } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { Shell } from "@/components/shell";
import { SignIn } from "@/components/sign-in";
import { WorkspacePicker } from "@/components/workspace-picker";

/**
 * The gates every console page sits behind.
 *
 * Both render IN PLACE rather than redirecting. The access token lives in
 * memory (see `lib/hub.ts`), so a hard load of `/runs/abc` has no session —
 * but bouncing to a sign-in URL would throw away the address somebody was
 * sent. Signing in here leaves the URL alone, and the page underneath renders
 * the moment there is a session to render it with.
 *
 * The workspace gate is narrower than it looks: the organization's own
 * screens are ABOVE any workspace, and demanding one before showing them
 * would strand a brand-new account on a picker with nothing to pick — unable
 * to reach the very screen that pairs its first machine.
 */
export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email, workspaceId } = useSession();
  const pathname = usePathname();

  if (!email) {
    return <SignIn />;
  }

  const needsWorkspace = !workspaceId && !isOrganizationLevel(pathname);
  return <Shell>{needsWorkspace ? <WorkspacePicker /> : children}</Shell>;
}
