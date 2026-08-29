// Static decorative clusters for the Earn with Us page, one treatment per
// section so the page never gets noisy (see docs/design/illustration-style.md;
// decoration is desktop-only, locked rule):
//   - EarnHeroDoodles: faint navy monoline glyphs behind the hero copy, same
//     family as ProductDoodles (megaphone, chat bubble, trend arrow).
//   - EligibilityCornerObjects: small flat natural-color objects pinned to the
//     band corners (coin stack, paper plane, envelope with a rupee note).
//   - AgentTracksDoodles: signpost with two diverging arrows plus a briefcase
//     and house pairing, corner-pinned around the two agent-track cards.
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
        <path d="M6 34 L84 8 L52 52 L40 38 Z" fill="#95CCDD" stroke="#315FC7" strokeWidth="2" strokeLinejoin="round" opacity="0.75"/>
        <path d="M40 38 L44 54 L52 52" fill="#BFE0EA" stroke="#315FC7" strokeWidth="2" strokeLinejoin="round" opacity="0.75"/>
        <path d="M2 46 q10 -4 18 2 M10 56 q8 -3 14 1" stroke="#315FC7" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
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

export function AgentTracksDoodles() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden lg:block"
    >
      {/* top-left: signpost with two diverging arrows, picking a track */}
      <svg
        className="absolute left-10 top-10 h-20 w-20"
        viewBox="0 0 80 80"
        fill="none"
        opacity="0.75"
      >
        <rect x="37" y="18" width="6" height="46" rx="2" fill="#8C6E4A" />
        <path
          d="M8 22 L38 14 L38 30 L8 22 Z"
          fill="#95CCDD"
          stroke="#293681"
          strokeWidth="2"
          strokeLinejoin="round"
          opacity="0.85"
        />
        <path
          d="M72 30 L42 22 L42 38 L72 30 Z"
          fill="#E8B54D"
          stroke="#C08A2E"
          strokeWidth="2"
          strokeLinejoin="round"
          opacity="0.85"
        />
        <ellipse cx="40" cy="66" rx="10" ry="3" fill="#C9C2B0" opacity="0.6" />
      </svg>
      {/* bottom-right: briefcase and house paired, the two lines */}
      <svg
        className="absolute bottom-10 right-10 h-16 w-28"
        viewBox="0 0 112 64"
        fill="none"
        opacity="0.75"
      >
        <g transform="translate(0,10)">
          <rect x="4" y="14" width="38" height="26" rx="4" fill="#315FC7" opacity="0.85" />
          <rect x="16" y="6" width="14" height="10" rx="2" fill="none" stroke="#293681" strokeWidth="2" />
          <path d="M4 26 h38" stroke="#293681" strokeWidth="1.6" />
        </g>
        <g transform="translate(58,0)">
          <path d="M4 26 L27 8 L50 26" stroke="#C4633F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="12" y="24" width="30" height="24" rx="2" fill="#F2D28A" stroke="#C08A2E" strokeWidth="1.6" />
          <rect x="23" y="34" width="8" height="14" fill="#6B4E16" opacity="0.7" />
        </g>
      </svg>
    </div>
  );
}
