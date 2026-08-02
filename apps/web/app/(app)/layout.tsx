import { AppShell } from "@/components/app-shell/app-shell";
import { AuthGate } from "@/features/auth/auth-gate";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate><AppShell>{children}</AppShell></AuthGate>;
}
