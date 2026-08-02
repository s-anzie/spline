import { cn } from "@/lib/utils";

export function StatusDot({ status = "online" }: { status?: "online" | "idle" | "offline" | "error" }) {
  return <span className={cn("size-1.5 rounded-full", status === "online" && "bg-emerald-400", status === "idle" && "bg-amber-400", status === "offline" && "bg-neutral-600", status === "error" && "bg-red-400")} />;
}
