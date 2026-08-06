import { Suspense } from "react";
import type { Metadata } from "next";

import { SignInForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Sign in — Spline" };

/**
 * `useSearchParams` reads something only the browser knows, so the form is
 * suspended: without this the whole route falls back to client rendering at
 * build time and Next says so as an error.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
