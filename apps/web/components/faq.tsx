import { ChevronDown } from "lucide-react";

// Home page FAQ: objection handling + an SEO surface. Native <details>/<summary>
// accordion, no client JS or shadcn accordion needed (that primitive isn't
// installed and its CLI needs container pnpm). Accessible and keyboard-native
// by default (Enter/Space toggles the native <summary>).
type Item = { q: string; a: string };

const ITEMS: Item[] = [
  {
    q: "Is the platform free to use?",
    a: "Yes. There's no charge to borrowers or buyers for using the platform, comparing offers, or getting matched with a partner.",
  },
  {
    q: "How do you verify partners and listings?",
    a: "Every lender, agent, and listing goes through a KYC check before it reaches you, so you're never dealing with someone unverified.",
  },
  {
    q: "Do you cover both loans and real estate?",
    a: "Yes. You can compare loan offers and browse verified homes in the same place, with the same team supporting you.",
  },
  {
    q: "What happens after I leave my number?",
    a: "One of our team calls you back to understand what you need and connect you with the right lender or agent.",
  },
  {
    q: "Will you sell my number to anyone?",
    a: "No. We never sell or share your number. It's only used to call you back about your own enquiry.",
  },
  {
    q: "How do I become an agent?",
    a: "Apply through the Earn with Us section below, we verify your KYC, and once you're approved you can start earning commission.",
  },
];

export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="relative w-full overflow-hidden scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <FaqDoodles />
      <div className="relative mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="text-center">
          <h2
            id="faq-heading"
            className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
          >
            Frequently asked questions
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            Answers to what people usually ask before they get started.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-[var(--nav-border)] bg-surface shadow-sm">
          {ITEMS.map((item, index) => (
            <details
              key={item.q}
              className={
                index === 0
                  ? "group"
                  : "group border-t border-[var(--nav-border)]"
              }
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-heading text-base font-semibold text-foreground marker:content-none">
                {item.q}
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-brand-blue transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="px-6 pb-5 text-base text-text-secondary">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// Faint question-mark doodles in the FAQ side gutters, shades of blue, low opacity
// so they read as a soft background texture (not decoration competing with the copy).
// Desktop-only (lg+), pointer-events-none, sit behind the accordion.
type QMark = {
  top: string;
  left?: string;
  right?: string;
  size: number;
  color: string;
  opacity: number;
  rot: number;
};

const QMARKS: QMark[] = [
  { top: "11%", left: "6%", size: 104, color: "#4274D9", opacity: 0.1, rot: -12 },
  { top: "42%", left: "3%", size: 64, color: "#95CCDD", opacity: 0.2, rot: 8 },
  { top: "72%", left: "8%", size: 128, color: "#293681", opacity: 0.08, rot: -6 },
  { top: "15%", right: "5%", size: 84, color: "#293681", opacity: 0.1, rot: 10 },
  { top: "50%", right: "4%", size: 112, color: "#4274D9", opacity: 0.12, rot: -10 },
  { top: "80%", right: "8%", size: 60, color: "#95CCDD", opacity: 0.2, rot: 14 },
];

function FaqDoodles() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block"
    >
      {QMARKS.map((q, i) => (
        <span
          key={i}
          className="absolute select-none font-heading font-bold leading-none"
          style={{
            top: q.top,
            left: q.left,
            right: q.right,
            fontSize: q.size,
            color: q.color,
            opacity: q.opacity,
            transform: `rotate(${q.rot}deg)`,
          }}
        >
          ?
        </span>
      ))}
    </div>
  );
}
