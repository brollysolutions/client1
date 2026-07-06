import { LeadDialog } from "@/components/lead-dialog";

// Home "Earn with Us": the supply-side pitch (agents), mirrors line-split.tsx /
// why-choose-us.tsx's two-column grid pattern. Recruits for BOTH lines; agents
// are single-line, so the apply CTA lets the applicant pick one at submit time
// (LeadDialog's lineSelectable, see lead-dialog.tsx). Flow: apply -> admin does
// manual KYC verification -> account is provisioned (no public backend yet,
// origin tag routes it later). Blue-only like the rest of the public site.
const BENEFITS = [
  "Recruiting agents for both loans and real estate",
  "Earn commission on every referral you bring in",
  "Apply, we verify your KYC, you start earning",
];

export function PartnerCta() {
  return (
    <section
      id="partners"
      aria-labelledby="partners-heading"
      className="w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:order-2 lg:text-left">
            <h2
              id="partners-heading"
              className="font-heading text-3xl font-semibold text-[var(--nav-text)] sm:text-4xl"
            >
              Earn with us
            </h2>
            <p className="mt-4 text-lg text-[var(--nav-text)] sm:text-xl">
              Become a partner agent and earn commission helping people find
              the right loan or the right home.
            </p>
            <ul className="mt-7 space-y-3 text-left">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                  <span className="text-base text-foreground sm:text-lg">
                    {benefit}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-7 flex justify-center lg:justify-start">
              <LeadDialog
                businessLine="loans"
                lineSelectable
                origin="agent-application"
                triggerLabel="Apply to become an agent"
                title="Apply to become an agent"
                description="Tell us your details and pick a line. We'll verify your KYC and get you started."
                submitLabel="Submit application"
              />
            </div>
          </div>

          {/* Illustration is decorative + desktop-only (lg+), hand-coded per
              docs/design/illustration-style.md's objects/icons pipeline. */}
          <div className="mx-auto hidden w-full max-w-[420px] lg:order-1 lg:block">
            <PartnerIllustration className="h-auto w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

// Story: an agent ID badge, verified with a check, sits beside a rising coin
// stack with a growth arrow, that is, apply, get verified, start earning.
// Objects-only scene, hand-coded per illustration-style.md. Blue leads the
// badge (the brandable hero surface), coins stay warm gold, navy is ink.
function PartnerIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="100 400 400 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id="partnerGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F3F3EE" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#F3F3EE" stopOpacity="0.28" />
          <stop offset="1" stopColor="#F3F3EE" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="partnerGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F8F8F4" />
          <stop offset="1" stopColor="#E9E5D9" />
        </linearGradient>
        <filter id="partnerSoft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* base plate */}
      <ellipse cx="300" cy="486" rx="200" ry="150" fill="url(#partnerGlow)" />
      <ellipse cx="300" cy="644" rx="160" ry="24" fill="#293681" opacity="0.15" filter="url(#partnerSoft)" />
      <ellipse cx="300" cy="636" rx="160" ry="26" fill="#F3F3EE" opacity="0.5" />
      <ellipse cx="300" cy="634" rx="160" ry="25" fill="url(#partnerGround)" opacity="0.85" />

      {/* lanyard strap, behind the badge */}
      <path
        d="M255 430 L235 460 L255 490 M255 430 Q285 405 315 430 M315 430 L335 460 L315 490"
        stroke="#293681"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* agent ID badge: blue leads (the brandable hero surface) */}
      <rect x="230" y="486" width="140" height="110" rx="14" fill="#4274D9" stroke="#293681" strokeWidth="3" />
      <circle cx="300" cy="524" r="20" fill="#FFFFFF" fillOpacity="0.9" />
      <path d="M292 524 Q300 534 300 524 Q300 512 285 512 Q270 512 270 534 L330 534 Q330 512 315 512 Q300 512 300 524" fill="none" />
      {/* simple person glyph inside the badge circle (faceless, objects-only) */}
      <circle cx="300" cy="517" r="7" fill="#4274D9" />
      <path d="M286 536 Q300 522 314 536 Z" fill="#4274D9" />
      <line x1="252" y1="562" x2="348" y2="562" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
      <line x1="252" y1="576" x2="322" y2="576" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />

      {/* verified check badge, clipped on the ID badge corner */}
      <circle cx="364" cy="596" r="20" fill="#FFFFFF" stroke="#293681" strokeWidth="3" />
      <polyline points="356 596 362 602 373 588" fill="none" stroke="#4274D9" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* rising coin stack + growth arrow, right side */}
      <g>
        <ellipse cx="430" cy="606" rx="26" ry="9" fill="#E8B54D" stroke="#C08A2E" strokeWidth="2.4" />
        <ellipse cx="430" cy="586" rx="24" ry="8" fill="#E8B54D" stroke="#C08A2E" strokeWidth="2.4" />
        <ellipse cx="430" cy="567" rx="22" ry="8" fill="#EFC46A" stroke="#C08A2E" strokeWidth="2.4" />
        <text x="430" y="572" textAnchor="middle" fontSize="15" fontWeight={700} fill="#6B4E16" fontFamily="system-ui, sans-serif">&#8377;</text>
      </g>
      <polyline
        points="404 556 424 528 440 540 466 500"
        fill="none"
        stroke="#293681"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="452 500 466 500 466 514"
        fill="none"
        stroke="#293681"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* one warm natural element */}
      <path d="M150 596 Q150 566 172 566 Q168 590 150 596" fill="#6FA98C" />
      <rect x="146" y="594" width="10" height="14" rx="2" fill="#8A5A34" />
    </svg>
  );
}
