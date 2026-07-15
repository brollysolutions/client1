// Key / recovery scene for the forgot-password brand panel. A large composition
// that fills the left panel: a central padlock with a lifted (reopening) shackle,
// a wide recovery arc encircling it, a key, an envelope with an OTP chip, and a
// halo of orbiting nodes. Duotone white-line style. Decorative only.
export default function ForgotScene() {
  return (
    <svg
      viewBox="0 0 480 440"
      className="h-full w-full"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      {/* soft framing ring + wide halo of orbiting nodes */}
      <circle cx="240" cy="206" r="188" stroke="white" strokeOpacity="0.08" strokeDasharray="2 12" strokeWidth="2" />
      <g fill="white">
        <circle className="auth-anim-float-a" cx="76" cy="126" r="5" fillOpacity="0.5" />
        <circle className="auth-anim-float-c" cx="410" cy="110" r="4" fillOpacity="0.6" />
        <circle className="auth-anim-float-b" cx="70" cy="318" r="4" fillOpacity="0.45" />
      </g>

      {/* wide recovery arc encircling the padlock, with an arrowhead */}
      <g className="auth-anim-fade-up" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M150 132a108 108 0 1 1 -14 116" fill="none" strokeOpacity="0.5" />
        <path d="M136 192l-8 60 58-16" fill="none" strokeOpacity="0.5" />
      </g>

      {/* central padlock with a lifted (reopening) shackle */}
      <g className="auth-anim-fade-up">
        <path d="M204 196v-22a36 36 0 0 1 68 -12" stroke="white" strokeWidth="3.4" strokeLinecap="round" />
        <rect x="182" y="196" width="116" height="92" rx="16" fill="white" fillOpacity="0.12" stroke="white" strokeWidth="3.4" />
        <circle cx="240" cy="234" r="11" fill="white" />
        <path d="M240 244v20" stroke="white" strokeWidth="4" strokeLinecap="round" />
      </g>

      {/* key crossing the padlock, lower-left */}
      <g className="auth-anim-float-a" stroke="white" strokeWidth="3.2" strokeLinecap="round">
        <circle cx="150" cy="300" r="20" fill="white" fillOpacity="0.14" />
        <circle cx="150" cy="300" r="7" fill="white" stroke="none" />
        <path d="M169 300h74" />
        <path d="M226 300v16M243 300v13" />
      </g>

      {/* envelope with an OTP chip, lower-right */}
      <g className="auth-anim-badge-mail" transform="translate(298 244)">
        <rect width="104" height="74" rx="12" fill="white" fillOpacity="0.14" stroke="white" strokeWidth="3" />
        <path d="M4 10l48 34 48-34" stroke="white" strokeWidth="3" fill="none" strokeLinejoin="round" />
        <g transform="translate(24 48)">
          <rect width="56" height="22" rx="7" fill="#e0f2fe" stroke="white" strokeWidth="2" />
          <g fill="#0369a1">
            <circle cx="13" cy="11" r="3" />
            <circle cx="24" cy="11" r="3" />
            <circle cx="35" cy="11" r="3" />
            <circle cx="46" cy="11" r="3" />
          </g>
        </g>
      </g>
    </svg>
  );
}
