import Link from "next/link";
import { AuthGate } from "@/features/auth/auth-gate";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate><main className="dark relative grid min-h-screen place-items-center overflow-hidden bg-[#11100f] p-5 text-[#f2efea]"><div aria-hidden className="absolute left-1/2 top-[-18rem] size-[40rem] -translate-x-1/2 rounded-full bg-[#f47b64]/10 blur-[120px]"/><Link href="/" className="absolute left-6 top-6 text-lg font-semibold"><span className="mr-2 text-[#f47b64]">◉</span>spline</Link>{children}</main></AuthGate>;
}
