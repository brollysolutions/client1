// Onboarding / join scene for the register brand panel. A large composition that
// fills the left panel: a central ID card (avatar + fields + welcome badge), a
// join node, floating field chips, step dots, and a wide halo of orbiting nodes.
// Duotone white-line style so it reads on the sky gradient. Decorative only.
export default function RegisterScene() {
  return (
    <svg
      viewBox="0 0 480 440"
      className="h-full w-full"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      {/* soft framing ring + wide halo of orbiting nodes */}
      <circle cx="240" cy="200" r="186" stroke="white" strokeOpacity="0.08" strokeDasharray="2 12" strokeWidth="2" />
      <g fill="white">
        <circle className="auth-anim-float-a" cx="66" cy="118" r="5" fillOpacity="0.5" />
        <circle className="auth-anim-float-c" cx="414" cy="132" r="4" fillOpacity="0.6" />
        <circle className="auth-anim-float-b" cx="72" cy="322" r="4" fillOpacity="0.45" />
        <circle className="auth-anim-float-c" cx="420" cy="316" r="5" fillOpacity="0.5" />
      </g>

      {/* floating field chip, top-left */}
      <g className="auth-anim-float-a" transform="translate(40 150)">
        <rect width="88" height="34" rx="9" fill="white" fillOpacity="0.12" stroke="white" strokeWidth="2" />
        <circle cx="18" cy="17" r="7" fill="white" fillOpacity="0.85" />
        <path d="M32 17h44" stroke="white" strokeWidth="3" strokeOpacity="0.6" strokeLinecap="round" />
      </g>

      {/* floating check chip, bottom-right */}
      <g className="auth-anim-float-b" transform="translate(360 270)">
        <rect width="80" height="34" rx="9" fill="white" fillOpacity="0.12" stroke="white" strokeWidth="2" />
        <path d="M14 17l7 7 12-14" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M42 17h26" stroke="white" strokeWidth="3" strokeOpacity="0.5" strokeLinecap="round" />
      </g>

      {/* central ID / profile card */}
      <g className="auth-anim-fade-up">
        <rect x="118" y="120" width="244" height="168" rx="18" fill="white" fillOpacity="0.1" stroke="white" strokeWidth="3" />

        {/* avatar */}
        <circle cx="172" cy="176" r="24" fill="white" fillOpacity="0.18" stroke="white" strokeWidth="2.6" />
        <circle cx="172" cy="169" r="9" fill="white" />
        <path d="M155 194a17 17 0 0 1 34 0" fill="white" />

        {/* name + form lines */}
        <g stroke="white" strokeLinecap="round">
          <path d="M212 162h112" strokeWidth="5" strokeOpacity="0.85" />
          <path d="M212 182h84" strokeWidth="3.5" strokeOpacity="0.5" />
        </g>
        <g stroke="white" strokeWidth="3.5" strokeOpacity="0.45" strokeLinecap="round">
          <path d="M146 232h188" />
          <path d="M146 256h128" />
        </g>

        {/* welcome-check ribbon overlapping the top-right corner */}
        <g transform="translate(338 122)">
          <circle r="26" fill="#e0f2fe" stroke="white" strokeWidth="3" />
          <path d="M-11 1l8 8 14-17" stroke="#0369a1" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>

        {/* join "+" node overlapping the bottom-right corner */}
        <g className="auth-anim-float-a" transform="translate(346 282)">
          <circle r="22" fill="white" fillOpacity="0.16" stroke="white" strokeWidth="2.6" />
          <path d="M0 -10v20M-10 0h20" stroke="white" strokeWidth="3.6" strokeLinecap="round" />
        </g>
      </g>

      {/* three step dots along the base */}
      <g fill="white">
        <circle cx="222" cy="330" r="6" fillOpacity="0.9" />
        <circle cx="244" cy="330" r="6" fillOpacity="0.5" />
        <circle cx="266" cy="330" r="6" fillOpacity="0.5" />
      </g>
    </svg>
  );
}
