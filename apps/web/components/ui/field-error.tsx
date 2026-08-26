import { cn } from "@/lib/utils";

export function FieldError({
  id,
  children,
  className,
}: {
  id: string;
  children: string | undefined;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className={cn("text-sm text-destructive", className)}>
      {children}
    </p>
  );
}

export function RequiredIndicator() {
  return (
    <>
      <span aria-hidden="true"> *</span>
      <span className="sr-only"> (required)</span>
    </>
  );
}
