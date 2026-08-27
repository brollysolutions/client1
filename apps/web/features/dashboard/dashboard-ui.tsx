import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function DashboardPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1440px] space-y-6 px-4 sm:px-6 lg:px-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

// No eyebrow above the title. The kicker repeated what the sidebar's active
// section already says, and on the pages that had one it pushed the actual
// heading down without adding information.
export function DashboardHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-6 text-text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</section>;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  href,
  hint,
  attention = false,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  href?: string;
  hint?: string;
  attention?: boolean;
}) {
  const content = (
    <div
      className={cn(
        "group flex min-h-28 items-start justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm transition-colors",
        attention ? "border-warning/35" : "border-border",
        href && "hover:border-brand-cta",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-text-primary">
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-text-secondary">{hint}</p> : null}
      </div>
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
          attention ? "bg-warning/10 text-warning" : "bg-brand-cta-tint text-brand-cta",
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
    </div>
  );

  return href ? (
    <Link href={href} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
      {content}
    </Link>
  ) : (
    content
  );
}

export function DashboardPanel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-sm", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-text-secondary">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function DashboardSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-text-secondary">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function DashboardFormPage({
  title,
  description,
  backHref,
  backLabel,
  formTitle,
  formDescription,
  children,
  aside,
  embedded = false,
}: {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  formTitle: string;
  formDescription?: string;
  children: ReactNode;
  aside?: ReactNode;
  embedded?: boolean;
}) {
  const formLayout = (
    <div
      className={cn(
        "grid items-start gap-4",
        aside ? "xl:grid-cols-[minmax(0,1fr)_20rem]" : "max-w-5xl",
      )}
    >
      <DashboardPanel title={formTitle} description={formDescription}>
        {children}
      </DashboardPanel>
      {aside ? <aside className="space-y-4">{aside}</aside> : null}
    </div>
  );

  if (embedded) return formLayout;

  return (
    <DashboardPage>
      <DashboardHeader
        title={title}
        description={description}
        actions={<DashboardBackLink href={backHref}>{backLabel}</DashboardBackLink>}
      />
      {formLayout}
    </DashboardPage>
  );
}

export function DashboardFormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-text-secondary">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function QuickActionGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

export function DashboardQuickAction({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-28 items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-cta-tint text-brand-cta">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-text-primary">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-text-secondary">{description}</span>
      </span>
      <ArrowRight
        className="mt-1 h-4 w-4 shrink-0 text-text-secondary transition-transform group-hover:translate-x-0.5 group-hover:text-brand-cta"
        aria-hidden="true"
      />
    </Link>
  );
}

export function DashboardTextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-cta hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

export function DashboardBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-cta hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </Link>
  );
}
