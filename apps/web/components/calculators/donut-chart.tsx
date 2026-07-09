import { formatCompactINR, formatINR } from "@/lib/format";

// Principal-vs-interest donut. Hand-coded inline SVG (two arcs) so it needs no
// chart library, renders on mobile and desktop, and stays on the blue-only
// palette: principal in the brand blue, interest in the deeper navy.
export function DonutChart({
  principal,
  interest,
  centerLabel,
}: {
  principal: number;
  interest: number;
  centerLabel?: string;
}) {
  const total = Math.max(0, principal) + Math.max(0, interest);
  const fraction = total > 0 ? Math.max(0, principal) / total : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius; // ~326.73
  const principalArc = fraction * circumference;
  const principalPct = Math.round(fraction * 100);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <svg
        viewBox="0 0 120 120"
        className="h-40 w-40 shrink-0"
        role="img"
        aria-label={`Principal ${formatINR(principal)} (${principalPct}%), interest ${formatINR(
          interest,
        )} (${100 - principalPct}%)`}
      >
        {/* interest ring (full circle, navy) */}
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--color-brand-navy)" strokeWidth="16" />
        {/* principal arc (blue), drawn from 12 o'clock */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--nav-primary)"
          strokeWidth="16"
          strokeDasharray={`${principalArc} ${circumference - principalArc}`}
          strokeDashoffset="0"
          transform="rotate(-90 60 60)"
        />
        <text
          x="60"
          y="58"
          textAnchor="middle"
          className="fill-[var(--nav-text)] font-heading text-[11px] font-semibold"
        >
          {centerLabel ?? "Total"}
        </text>
        <text x="60" y="72" textAnchor="middle" className="fill-[var(--nav-text)] font-heading text-[13px] font-bold">
          {formatCompactINR(total)}
        </text>
      </svg>

      <dl className="grid gap-3 text-sm">
        <LegendRow color="var(--nav-primary)" label="Principal" value={formatINR(principal)} pct={principalPct} />
        <LegendRow
          color="var(--color-brand-navy)"
          label="Total interest"
          value={formatINR(interest)}
          pct={100 - principalPct}
        />
      </dl>
    </div>
  );
}

function LegendRow({
  color,
  label,
  value,
  pct,
}: {
  color: string;
  label: string;
  value: string;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
      <dt className="text-text-secondary">{label}</dt>
      <dd className="ml-auto font-medium text-[var(--nav-text)]">
        {value} <span className="text-text-secondary">({pct}%)</span>
      </dd>
    </div>
  );
}
