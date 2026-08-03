import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
    <div>{eyebrow && <p className="mb-1 text-[8px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{eyebrow}</p>}<h1 className="text-xl font-medium tracking-[-.035em] sm:text-2xl">{title}</h1><p className="mt-1.5 max-w-2xl text-[10px] leading-4 text-muted-foreground">{description}</p></div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </header>;
}
