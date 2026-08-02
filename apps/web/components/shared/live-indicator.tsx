import { cn } from "@/lib/utils";

export function LiveIndicator({ label = "Temps réel", tone = "healthy" }: { label?: string; tone?: "healthy" | "warning" | "danger" }) {
  return <span className="inline-flex items-center gap-2 text-[8px] text-muted-foreground"><span className="relative flex size-2"><span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-50 motion-reduce:animate-none",tone==="healthy"&&"bg-emerald-400",tone==="warning"&&"bg-amber-400",tone==="danger"&&"bg-red-400")}/><span className={cn("relative inline-flex size-2 rounded-full",tone==="healthy"&&"bg-emerald-400",tone==="warning"&&"bg-amber-400",tone==="danger"&&"bg-red-400")}/></span>{label}</span>;
}
