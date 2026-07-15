// Secure sign-in scene for the login brand panel. A large composition that fills
// the left panel: a central shield (fingerprint + padlock + verified badge),
// pulsing rings, a wide halo of orbiting nodes, and two floating credential cards.
// Duotone white-line style so it reads on the sky gradient. Decorative only.
export default function LoginScene() {
  return (
    <svg
      viewBox="0 0 480 440"
      className="h-full w-full"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      {/* pulsing rings behind the shield */}
      <g stroke="white">
        <circle className="auth-anim-ring" cx="240" cy="210" r="150" strokeOpacity="0.14" />
        <circle cx="240" cy="210" r="188" strokeOpacity="0.08" strokeDasharray="2 12" strokeWidth="2" />
      </g>

      {/* wide halo of orbiting nodes reaching the canvas edges */}
      <g fill="white">
        <circle className="auth-anim-float-a" cx="70" cy="120" r="5" fillOpacity="0.5" />
        <circle className="auth-anim-float-c" cx="410" cy="96" r="4" fillOpacity="0.6" />
        <circle className="auth-anim-float-b" cx="432" cy="300" r="5" fillOpacity="0.4" />
        <circle className="auth-anim-float-c" cx="58" cy="330" r="4" fillOpacity="0.5" />
      </g>

      {/* floating credential card, top-left */}
      <g className="auth-anim-float-a" transform="translate(40 150)">
        <rect width="96" height="60" rx="10" fill="white" fillOpacity="0.12" stroke="white" strokeWidth="2" />
        <circle cx="24" cy="24" r="11" fill="white" fillOpacity="0.9" />
        <path d="M46 20h34M46 32h24" stroke="white" strokeWidth="3" strokeOpacity="0.7" strokeLinecap="round" />
        <path d="M14 46h68" stroke="white" strokeWidth="2.5" strokeOpacity="0.4" strokeLinecap="round" />
      </g>

      {/* floating key chip, bottom-right */}
      <g className="auth-anim-float-b" transform="translate(356 262)">
        <rect width="92" height="56" rx="10" fill="white" fillOpacity="0.12" stroke="white" strokeWidth="2" />
        <circle cx="26" cy="28" r="9" fill="none" stroke="white" strokeWidth="2.6" />
        <path d="M35 28h30M58 28v10M65 28v8" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      </g>

      {/* central shield */}
      <g className="auth-anim-fade-up">
        <path
          d="M240 78l86 32v66c0 64-42 108-86 128-44-20-86-64-86-128v-66l86-32z"
          fill="white"
          fillOpacity="0.1"
          stroke="white"
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {/* fingerprint arcs filling the shield */}
        <g stroke="white" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round">
          <path d="M186 196a54 54 0 0 1 108 0" />
          <path d="M200 196a40 40 0 0 1 80 0" />
          <path d="M214 196a26 26 0 0 1 52 0" />
        </g>

        {/* padlock */}
        <path d="M216 200v-16a24 24 0 0 1 48 0v16" stroke="white" strokeWidth="3" strokeLinecap="round" />
        <rect x="204" y="200" width="72" height="56" rx="10" fill="white" fillOpacity="0.16" stroke="white" strokeWidth="3" />
        <circle cx="240" cy="224" r="7" fill="white" />
        <path d="M240 230v13" stroke="white" strokeWidth="3.4" strokeLinecap="round" />

        {/* verified badge on the shield's lower-right */}
        <g transform="translate(292 244)">
          <circle r="24" fill="#e0f2fe" stroke="white" strokeWidth="3" />
          <path d="M-10 1l7 7 13-15" stroke="#0369a1" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      </g>
    </svg>
  );
}
