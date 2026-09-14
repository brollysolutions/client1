import * as React from "react";

// Shared page closer: a quiet sky surface ends directly at the navy footer.
// Keep enquiry/link behavior in the caller so each journey retains its context.
export function ClosingCtaFrame({
  heading,
  text,
  id = "get-started",
  children,
}: {
  heading: string;
  text: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="w-full scroll-mt-16 border-t border-border bg-surface-sky dark:bg-surface"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16 lg:px-8 lg:py-20">
        <div className="max-w-2xl border-l-2 border-brand-sky pl-5 sm:pl-7">
          <h2 id={`${id}-heading`} className="text-balance font-heading text-3xl font-semibold tracking-tight text-brand-heading sm:text-4xl">
            {heading}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-text-secondary sm:text-lg">
            {text}
          </p>
        </div>
        <div className="flex w-full flex-col items-stretch sm:w-fit lg:min-w-52">
          {children}
        </div>
      </div>
    </section>
  );
}
