"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { HELP_TOPICS, START_STEPS } from "./help-content";
import type { UserRole } from "@/lib/auth";
import { isDashboardPathAllowed, type DashboardAccessContext } from "@/features/dashboard/nav-items";

export function HelpCenter({ role, started = false, access }: { role?: UserRole; started?: boolean; access?: DashboardAccessContext }) {
  const [query, setQuery] = useState("");
  const base = role ? "/dashboard" : "";
  const topics = HELP_TOPICS.filter((topic) => (!access || isDashboardPathAllowed(topic.href, access)) && (!topic.roles || (role ? topic.roles.includes(role) : topic.roles.includes("client"))) && `${topic.title} ${topic.answer}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
    <header className="max-w-3xl space-y-4 border-b border-border pb-8">
      <p className="text-sm font-medium text-brand-link">Dhanadhara guides{role ? ` · ${role.replace("_", " ")}` : ""}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-brand-heading sm:text-4xl">{started ? "Get started with Dhanadhara" : "Dhanadhara Help Center"}</h1>
      <p className="max-w-2xl text-base leading-7 text-text-secondary">{started ? "A practical guide to your account, your workspace and the people helping you move forward." : "Find clear answers about your account, enquiries and everyday work."}</p>
      <Link href={`${base}/${started ? "help-center" : "get-started"}`} className="inline-flex min-h-11 items-center gap-2 font-medium text-brand-link">{started ? "Browse the Help Center" : "New here? Get started"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
    </header>
    {started && <ol className="grid gap-5 md:grid-cols-3">{START_STEPS[role ?? "visitor"].map((step, index) => <li key={step.title} className="flex flex-col rounded-xl border border-border bg-card p-6"><span className="text-sm font-semibold tabular-nums text-brand-link">0{index + 1}</span><h2 className="mt-5 text-xl font-semibold">{step.title}</h2><p className="mb-6 mt-3 flex-1 text-sm leading-6 text-text-secondary">{step.text}</p><Link href={step.href} className="inline-flex min-h-11 items-center gap-2 font-medium text-brand-link">Continue<ArrowRight className="h-4 w-4" aria-hidden="true" /><span className="sr-only">: {step.title}</span></Link></li>)}</ol>}
    <section className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]" aria-labelledby="help-topics-title">
      <div><h2 id="help-topics-title" className="text-xl font-semibold">Find an answer</h2><p className="mt-2 text-sm leading-6 text-text-secondary">Search by topic or open a guide below. Your account controls which actions are available.</p><label htmlFor="help-search" className="mt-5 block text-sm font-medium">Search guides</label><div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-text-secondary" aria-hidden="true" /><Input id="help-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try account or documents" className="pl-9" /></div><p className="mt-3 text-xs text-text-secondary" aria-live="polite">{topics.length} guides found</p></div>
      <div className="min-w-0 divide-y divide-border rounded-xl border border-border bg-card px-5 sm:px-7">{topics.map((topic) => <details key={topic.id} id={topic.id} className="group py-5"><summary className="cursor-pointer rounded text-base font-semibold leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{topic.title}</summary><p className="mt-4 max-w-[70ch] text-sm leading-7 text-text-secondary">{topic.answer}</p><Link className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-link" href={!role && topic.href.startsWith("/dashboard") ? "/login" : topic.href}>{!role && topic.href.startsWith("/dashboard") ? "Sign in to continue" : topic.action}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></details>)}{topics.length === 0 && <p className="py-8 text-text-secondary">No matching guides. Try a different phrase or contact support.</p>}</div>
    </section>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-6"><div><h2 className="text-lg font-semibold">Still need a hand?</h2><p className="mt-1 text-sm text-text-secondary">{role ? "Raise a ticket and track its progress in your workspace." : "Use the published contact details or recover access to your account."}</p></div><Link href={role ? "/dashboard/support" : "/contact"} className="inline-flex min-h-11 items-center gap-2 font-medium text-brand-link">Contact support<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></section>
  </div>;
}
