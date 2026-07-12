// Static decorative clusters for the Earn with Us page, one treatment per
// section so the page never gets noisy (see docs/design/illustration-style.md;
// decoration is desktop-only, locked rule):
//   - EarnHeroDoodles: faint navy monoline glyphs behind the hero copy, same
//     family as ProductDoodles (megaphone, chat bubble, trend arrow).
//   - EligibilityCornerObjects: small flat natural-color objects pinned to the
//     band corners (coin stack, paper plane, envelope with a rupee note).
//   - PayoutConfetti: a tiny celebration cluster for the payout end of the
//     commission timeline.
// All aria-hidden, pointer-events-none, hidden below lg.

export function EarnHeroDoodles() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden text-[#293681] opacity-[0.08] lg:block"
    >
      {/* top-left, above the heading */}
      <svg
        className="absolute left-8 top-8 h-24 w-[300px]"
        viewBox="0 0 300 96"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* megaphone: telling friends */}
        <g transform="translate(8,22)">
          <path d="M0 14 L26 4 L26 34 L0 24 Z" />
          <path d="M26 8 q12 11 0 22" />
          <path d="M6 24 l3 12 h8 l-3 -12" />
        </g>
        {/* chat bubble with rupee */}
        <g transform="translate(96,16)">
          <rect x="0" y="0" width="44" height="30" rx="8" />
          <path d="M12 30 l3 10 l9 -10" />
          <text
            x="22"
            y="21"
            textAnchor="middle"
            fontSize="16"
            fontWeight={700}
            fill="currentColor"
            stroke="none"
            fontFamily="system-ui, sans-serif"
          >
            &#8377;
          </text>
        </g>
        {/* trend arrow */}
        <g transform="translate(196,26)">
          <polyline points="0 34 16 18 26 24 46 2" />
          <polyline points="36 2 46 2 46 12" />
        </g>
      </svg>
      {/* bottom, under the CTAs, drifting right */}
      <svg
        className="absolute bottom-6 left-[36%] h-16 w-[220px]"
        viewBox="0 0 220 64"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* coin pair */}
        <g transform="translate(6,14)">
          <circle cx="14" cy="14" r="13" />
          <circle cx="34" cy="22" r="9" />
        </g>
        {/* handshake strokes */}
        <g transform="translate(96,18)">
          <path d="M0 16 q14 -14 28 -2 M28 14 q10 8 22 2" />
          <path d="M18 24 l8 6 M30 20 l8 6" />
        </g>
      </svg>
    </div>
  );
}

export function EligibilityCornerObjects() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden lg:block"
    >
      {/* top-right: paper plane sailing in */}
      <svg
        className="absolute right-10 top-12 h-16 w-24"
        viewBox="0 0 96 64"
        fill="none"
      >
        <path d="M6 34 L84 8 L52 52 L40 38 Z" fill="#95CCDD" stroke="#4274D9" strokeWidth="2" strokeLinejoin="round" opacity="0.75"/>
        <path d="M40 38 L44 54 L52 52" fill="#BFE0EA" stroke="#4274D9" strokeWidth="2" strokeLinejoin="round" opacity="0.75"/>
        <path d="M2 46 q10 -4 18 2 M10 56 q8 -3 14 1" stroke="#4274D9" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
      </svg>
      {/* bottom-left: coin stack */}
      <svg
        className="absolute bottom-10 left-8 h-16 w-20"
        viewBox="0 0 80 64"
        fill="none"
        opacity="0.75"
      >
        <ellipse cx="34" cy="52" rx="22" ry="7" fill="#C08A2E"/>
        <rect x="12" y="38" width="44" height="14" rx="7" fill="#E8B54D" stroke="#C08A2E" strokeWidth="1.6"/>
        <rect x="12" y="28" width="44" height="14" rx="7" fill="#E8B54D" stroke="#C08A2E" strokeWidth="1.6"/>
        <ellipse cx="34" cy="28" rx="22" ry="7" fill="#F2D28A" stroke="#C08A2E" strokeWidth="1.6"/>
        <text x="62" y="24" fontFamily="system-ui, sans-serif" fontSize="14" fontWeight={700} fill="#C08A2E" opacity="0.9">&#8377;</text>
      </svg>
      {/* bottom-right: envelope with rupee note peeking */}
      <svg
        className="absolute bottom-12 right-12 h-14 w-20"
        viewBox="0 0 80 56"
        fill="none"
        opacity="0.75"
      >
        <rect x="10" y="22" width="60" height="30" rx="4" fill="#F3F3EE" stroke="#C9C2B0" strokeWidth="2"/>
        <path d="M10 24 L40 44 L70 24" stroke="#C9C2B0" strokeWidth="2" fill="none"/>
        <rect x="20" y="10" width="40" height="16" rx="2" fill="#6FA98C"/>
        <circle cx="40" cy="18" r="5" fill="none" stroke="#D8E4C8" strokeWidth="1.6"/>
      </svg>
    </div>
  );
}

export function PayoutConfetti() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-6 right-6 z-0 hidden lg:block"
    >
      <svg className="h-24 w-28" viewBox="0 0 112 96" fill="none" opacity="0.8">
        <rect x="18" y="20" width="8" height="8" rx="2" fill="#C4633F" transform="rotate(22 22 24)"/>
        <rect x="78" y="10" width="8" height="8" rx="2" fill="#6FA98C" transform="rotate(-18 82 14)"/>
        <rect x="96" y="48" width="7" height="7" rx="2" fill="#4274D9" transform="rotate(30 99 51)"/>
        <circle cx="52" cy="14" r="4" fill="#95CCDD"/>
        <circle cx="10" cy="56" r="3.5" fill="#C4633F"/>
        <path d="M34 44 q5 -8 10 0" stroke="#E8B54D" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M66 34 q6 -6 12 -2" stroke="#4274D9" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx="60" cy="66" r="12" fill="#E8B54D" stroke="#C08A2E" strokeWidth="2"/>
        <text x="60" y="71" textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize="12" fontWeight={700} fill="#6B4E16">&#8377;</text>
        <circle cx="86" cy="78" r="8" fill="#E8B54D" stroke="#C08A2E" strokeWidth="1.8"/>
        <path d="M28 76 l-6 -4 M40 84 l-4 6 M100 68 l6 -5" stroke="#C08A2E" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  );
}
