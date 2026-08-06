import { PublicFooter, PublicHeader } from "@/components/public";

/**
 * Everything anyone can read without an account.
 *
 * No session gate, no workspace, no rail — a page here must render for a
 * stranger, because that is who it is for.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
