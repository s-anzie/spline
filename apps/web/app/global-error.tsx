"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr" className="dark" style={{ colorScheme: "dark" }}>
      <body>
        <div className="grid min-h-screen place-items-center p-6 text-center">
          <div className="max-w-md">
            <h1 className="text-sm font-medium">
              Une erreur critique est survenue
            </h1>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              {error.message || "L’application n’a pas pu démarrer."}
            </p>
            <button
              onClick={reset}
              className="mt-5 rounded-lg bg-[#f47b64] px-4 py-2 text-[11px] font-medium text-[#241614]"
            >
              Réessayer
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
