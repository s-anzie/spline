import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="dark grid min-h-screen place-items-center bg-[#11100f] p-6 text-[#f2efea] [background-image:radial-gradient(circle_at_50%_0%,rgba(244,123,100,.1),transparent_35%)]"><Link href="/" className="absolute left-7 top-7 flex items-center gap-2 text-lg font-semibold"><span className="text-[#f47b64]">◉</span>spline</Link>{children}</main>;
}
