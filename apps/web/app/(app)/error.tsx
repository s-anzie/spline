"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppError({
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
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div className="max-w-md">
        <TriangleAlert className="mx-auto mb-4 size-8 text-amber-400" />
        <h1 className="text-sm font-medium">Une erreur est survenue</h1>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          {error.message ||
            "Le chargement de cette page a échoué de façon inattendue."}
        </p>
        <Button
          onClick={reset}
          className="mt-5 bg-[#f47b64] text-[#241614]"
        >
          <RotateCcw />
          Réessayer
        </Button>
      </div>
    </div>
  );
}
