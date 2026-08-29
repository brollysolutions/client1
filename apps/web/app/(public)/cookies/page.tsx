import type { Metadata } from "next";
import Link from "next/link";

import {
  BROWSER_STORAGE,
  ESSENTIAL_COOKIES,
  NON_ESSENTIAL_COOKIES_ENABLED,
} from "@/lib/cookie-notice";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cookie Notice",
  description: `The cookies and browser storage ${SITE_NAME} uses, why they are needed, and the choices available to you.`,
  alternates: { canonical: "/cookies" },
  openGraph: {
    title: "Cookie Notice",
    description: `The cookies and browser storage ${SITE_NAME} uses and why they are needed.`,
    type: "website",
    url: "/cookies",
  },
};

export default function CookiesPage() {
  return (
    <section className="w-full bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-3xl">
          <p className="font-geist text-sm font-semibold uppercase tracking-[0.16em] text-[var(--nav-primary)]">
            Privacy at a glance
          </p>
          <h1 className="mt-3 font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl">
            Cookie Notice
          </h1>
          <p className="mt-6 text-lg leading-8 text-[var(--nav-text)]">
            {SITE_NAME} currently uses only the essential cookies and browser
            storage needed to keep accounts secure, remember requested choices,
            and complete short multi-step flows.
          </p>
        </div>

        {!NON_ESSENTIAL_COOKIES_ENABLED && (
          <div className="mt-10 rounded-2xl border border-brand-blue/25 bg-brand-cta-tint p-6 sm:p-8">
            <h2 className="font-heading text-xl font-semibold text-[var(--nav-text)]">
              Why there is no “Accept cookies” banner
            </h2>
            <p className="mt-3 max-w-3xl leading-7 text-text-secondary">
              We do not currently set analytics, advertising, or cross-site
              tracking cookies. Essential cookies cannot be switched off while
              using signed-in features, so an accept-only banner would not give
              you a meaningful choice. Before any non-essential cookie is
              introduced, it must be blocked until the required consent is
              collected and this notice and its controls are updated.
            </p>
          </div>
        )}

        <div className="mt-12">
          <h2 className="font-heading text-2xl font-semibold text-[var(--nav-text)]">
            Essential cookies
          </h2>
          <p className="mt-3 max-w-3xl leading-7 text-text-secondary">
            These first-party cookies support authentication. They are not used
            to build advertising profiles or follow you across websites.
          </p>
          <div className="mt-6 grid gap-4 md:hidden">
            {ESSENTIAL_COOKIES.map((cookie) => (
              <article
                key={cookie.name}
                className="rounded-2xl border border-border bg-white p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-xs font-semibold text-[var(--nav-text)]">
                    {cookie.name}
                  </h3>
                  <span className="rounded-full bg-brand-cta-tint px-2 py-1 text-[11px] font-semibold text-brand-cta">
                    {cookie.category}
                  </span>
                </div>
                <dl className="mt-4 space-y-4 text-sm leading-6 text-text-secondary">
                  <div>
                    <dt className="font-semibold text-[var(--nav-text)]">Purpose</dt>
                    <dd className="mt-1">{cookie.purpose}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--nav-text)]">Duration</dt>
                    <dd className="mt-1">{cookie.duration}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--nav-text)]">Protection</dt>
                    <dd className="mt-1">{cookie.protection}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-border bg-white md:block">
            <table className="min-w-[760px] w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Essential cookies used by {SITE_NAME}
              </caption>
              <thead className="bg-muted text-[var(--nav-text)]">
                <tr>
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Cookie
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Purpose
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Duration
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Protection
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-text-secondary">
                {ESSENTIAL_COOKIES.map((cookie) => (
                  <tr key={cookie.name}>
                    <th
                      scope="row"
                      className="px-5 py-5 align-top font-mono text-xs font-semibold text-[var(--nav-text)]"
                    >
                      {cookie.name}
                      <span className="mt-2 block w-fit rounded-full bg-brand-cta-tint px-2 py-1 font-heading text-[11px] text-brand-cta">
                        {cookie.category}
                      </span>
                    </th>
                    <td className="px-5 py-5 align-top leading-6">{cookie.purpose}</td>
                    <td className="px-5 py-5 align-top leading-6">{cookie.duration}</td>
                    <td className="px-5 py-5 align-top leading-6">{cookie.protection}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-12">
          <h2 className="font-heading text-2xl font-semibold text-[var(--nav-text)]">
            Browser storage that is not a cookie
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {BROWSER_STORAGE.map((entry) => (
              <article
                key={entry.mechanism}
                className="rounded-2xl border border-border bg-white p-6"
              >
                <h3 className="font-heading text-lg font-semibold text-[var(--nav-text)]">
                  {entry.mechanism}
                </h3>
                <p className="mt-3 leading-7 text-text-secondary">{entry.purpose}</p>
                <p className="mt-4 text-sm leading-6 text-text-secondary">
                  <span className="font-semibold text-[var(--nav-text)]">Duration:</span>{" "}
                  {entry.duration}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-12 border-t border-[var(--nav-border)] pt-8 text-text-secondary">
          <h2 className="font-heading text-xl font-semibold text-[var(--nav-text)]">
            Your controls
          </h2>
          <p className="mt-3 max-w-3xl leading-7">
            You can clear cookies and stored site data in your browser. Doing so
            signs you out and removes saved choices on that device. Read our{" "}
            <Link
              href="/privacy"
              className="font-medium text-[var(--nav-primary)] underline underline-offset-4"
            >
              Privacy Policy
            </Link>{" "}
            for how personal information is handled, or{" "}
            <Link
              href="/contact"
              className="font-medium text-[var(--nav-primary)] underline underline-offset-4"
            >
              contact us
            </Link>{" "}
            with a question.
          </p>
          <p className="mt-8 text-sm text-text-secondary/80">
            Last updated: 29 August 2026
          </p>
        </div>
      </div>
    </section>
  );
}
