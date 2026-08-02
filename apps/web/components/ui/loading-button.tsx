import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LoadingButtonProps = React.ComponentProps<typeof Button> & {
  loading?: boolean;
  loadingText?: React.ReactNode;
};

export function LoadingButton({
  loading = false,
  loadingText,
  disabled,
  children,
  className,
  ...props
}: LoadingButtonProps) {
  return <Button
    aria-busy={loading}
    disabled={disabled || loading}
    className={cn("relative", loading && "cursor-wait", className)}
    {...props}
  >
    {loading ? <><LoaderCircle aria-hidden className="animate-spin"/>{loadingText ?? children}</> : children}
  </Button>;
}
