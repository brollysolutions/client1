// Faint question-mark doodles for FAQ section gutters, shades of blue, low
// opacity so they read as a soft background texture (not decoration competing
// with the copy). Desktop-only (lg+), pointer-events-none, sit behind the
// accordion. Shared by the home page FAQ and every calculator page FAQ.
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
  { top: "8%", left: "7%", size: 92, color: "#4274D9", opacity: 0.09, rot: -15 },
  { top: "28%", left: "3%", size: 56, color: "#95CCDD", opacity: 0.22, rot: 22 },
  { top: "63%", left: "9%", size: 118, color: "#293681", opacity: 0.07, rot: -4 },
  { top: "89%", left: "4%", size: 48, color: "#4274D9", opacity: 0.16, rot: 18 },
  { top: "18%", right: "6%", size: 76, color: "#293681", opacity: 0.11, rot: -20 },
  { top: "46%", right: "9%", size: 130, color: "#95CCDD", opacity: 0.13, rot: 6 },
  { top: "74%", right: "3%", size: 58, color: "#4274D9", opacity: 0.19, rot: -9 },
];

export function FaqDoodles() {
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
