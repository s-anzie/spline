import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
    <div>{eyebrow && <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{eyebrow}</p>}<h1 className="text-2xl font-medium tracking-[-.04em] sm:text-[28px]">{title}</h1><p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p></div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </header>;
}
