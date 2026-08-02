"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function RouteProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
  }, [pathname]);

  useEffect(() => {
    const start = (event: MouseEvent) => {
      const link = (event.target as Element).closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.origin !== window.location.origin) return;
      if (link.pathname !== window.location.pathname) setVisible(true);
    };
    document.addEventListener("click", start);
    return () => document.removeEventListener("click", start);
  }, []);

  return <div aria-hidden className={visible ? "route-progress is-visible" : "route-progress"}><span /></div>;
}
