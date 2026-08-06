"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { isOrganizationLevel, routes } from "@/lib/routes";
import { useRestorePreferences, useSession } from "@/lib/store";
import { Shell } from "@/components/shell";
import { WorkspacePicker } from "@/components/workspace-picker";

/**
 * The gates every console page sits behind.
 *
 * The session is picked back up from the hub before anything is decided: a
 * reload has no access token in memory, but it does have the httpOnly cookie,
 * and one call turns that back into a signed-in console. Until that call
 * answers the screen stays deliberately empty — showing the console would
 * flash data that may not be ours, and showing a sign-in page would flash a
 * form to somebody who is already signed in.
 *
 * When there is genuinely no session, the browser goes to `/sign-in` and
 * carries where it was headed. That address used to be rendered in place to
 * avoid losing it; carrying it in `?next=` keeps it without pretending two
 * different pages are one.
 *
 * The workspace gate is narrower than it looks: the organization's own
 * screens are ABOVE any workspace, and demanding one before showing them
 * would strand a brand-new account on a picker with nothing to pick — unable
 * to reach the very screen that pairs its first machine.
 */
/**
 * The Suspense boundary is not decoration: `useSearchParams` reads something
 * only a browser knows, and Next refuses to prerender a page that calls it
 * without one. Without this the production build of the whole console failed
 * — on whichever console page happened to be prerendered first, which made it
 * look like a different bug every time.
 *
 * The fallback is deliberately empty: it stands in for the moment before the
 * session is known, which is exactly what the gate below renders anyway.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <GatedConsole>{children}</GatedConsole>
    </Suspense>
  );
}

function GatedConsole({ children }: { children: React.ReactNode }) {
  const { email, workspaceId, restored, restore } = useSession();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  // Before the gates, not after: a hook cannot sit behind an early return, and
  // the console's own settings are not something you should have to sign in
  // twice to get back.
  useRestorePreferences();

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (!restored || email) {
      return;
    }
    const query = search.toString();
    const next = `${pathname}${query ? `?${query}` : ""}`;
    router.replace(`${routes.signIn}?next=${encodeURIComponent(next)}`);
  }, [restored, email, pathname, search, router]);

  if (!restored || !email) {
    return null;
  }

  const needsWorkspace = !workspaceId && !isOrganizationLevel(pathname);
  return <Shell>{needsWorkspace ? <WorkspacePicker /> : children}</Shell>;
}
