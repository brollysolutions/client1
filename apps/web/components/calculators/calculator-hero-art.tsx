import { cn } from "@/lib/utils";

// Decorative hero illustration for a calculator, hand-coded monoline in the
// brand blue so it needs no asset and stays on the blue-only public palette.
// Desktop-only (lg+), aria-hidden, per the illustrations rule. Two motifs: a
// finance scene for loan calculators, a house scene for property calculators.
// (Storyset Rafiki art can be swapped in here later without touching callers.)
export function CalculatorHeroArt({
  group,
  className,
}: {
  group: "loans" | "real_estate";
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "hidden w-[320px] shrink-0 rounded-2xl border border-[var(--nav-border)] bg-white/60 p-6 lg:block",
        className,
      )}
    >
      <svg
        viewBox="0 0 240 180"
        className="h-auto w-full text-[var(--nav-primary)]"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {group === "loans" ? <LoansArt /> : <RealEstateArt />}
      </svg>
    </div>
  );
}

function LoansArt() {
  return (
    <>
      {/* rising bars */}
      <rect x="24" y="104" width="26" height="46" rx="3" />
      <rect x="60" y="80" width="26" height="70" rx="3" />
      <rect x="96" y="56" width="26" height="94" rx="3" />
      {/* trend arrow over the bars */}
      <polyline points="30 96 74 66 110 44 150 30" />
      <polyline points="138 30 152 28 154 42" />
      {/* coin with rupee */}
      <circle cx="182" cy="118" r="30" />
      <text
        x="182"
        y="129"
        textAnchor="middle"
        fontSize="30"
        fontWeight={700}
        fill="currentColor"
        stroke="none"
        fontFamily="system-ui, sans-serif"
      >
        &#8377;
      </text>
      {/* small coins */}
      <circle cx="150" cy="150" r="10" />
      <circle cx="210" cy="156" r="8" />
    </>
  );
}

function RealEstateArt() {
  return (
    <>
      {/* house */}
      <path d="M40 92 L96 48 L152 92" />
      <rect x="56" y="92" width="80" height="62" rx="3" />
      <rect x="86" y="116" width="20" height="38" />
      <rect x="66" y="102" width="16" height="16" />
      <rect x="112" y="102" width="16" height="16" />
      {/* key */}
      <circle cx="186" cy="70" r="16" />
      <line x1="198" y1="82" x2="222" y2="106" />
      <line x1="212" y1="96" x2="206" y2="102" />
      <line x1="218" y1="102" x2="212" y2="108" />
      {/* ground line + growth marker */}
      <line x1="28" y1="156" x2="200" y2="156" />
      <polyline points="164 150 176 138 186 144 200 128" />
    </>
  );
}
