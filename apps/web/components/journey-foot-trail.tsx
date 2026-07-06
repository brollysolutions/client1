"use client";

import { useEffect, useRef, useState } from "react";

// Decorative curvy footprint trail overlaid behind the loans journey bands (lg+
// only). It walks the snake route the design calls for:
//   ill1 -> content1 -> content2 -> ill2 -> content3 -> ill3 -> content4 -> ill4
// A pure-CSS/percentage version can't make a smooth curve because it doesn't know
// the container's pixel aspect ratio, so this measures the overlay with a
// ResizeObserver, builds a smooth Catmull-Rom path through the eight waypoints,
// then samples evenly-spaced points with their tangent angle so each footprint
// points along the walk. Client component: needs layout measurement + effects.
// Decorative (aria-hidden), blue accent, low opacity. Renders nothing until
// measured (SSR-safe) — it is purely decorative and lg+ only.

type Foot = { x: number; y: number; rot: number; side: 1 | -1 };

// One realistic human footprint (viewBox 0 0 24 34), toes up (-y) at rotation 0:
// an asymmetric sole with an inner arch indent + five graduated toes in an arc =
// a right foot; caller mirrors with scaleX(-1) for the left foot.
function FootShape() {
  return (
    <>
      <path d="M12.8 8C15.8 8.4 17.1 10.8 16.7 13.8C16.3 16.4 15.3 17.9 15.2 20.3C15.1 23.3 14.8 26.1 13.4 28.5C12.6 29.9 11.1 30.6 9.7 30.2C8.1 29.7 7.5 27.7 7.7 25.4C7.9 22.7 8.6 20.9 8.2 18.6C7.9 16.7 6.8 15.7 6.6 13.7C6.3 10.6 8 8.1 10.6 8C11.3 8 12.1 7.9 12.8 8Z" />
      <ellipse cx="9.6" cy="4.9" rx="2.2" ry="2.7" />
      <circle cx="13.5" cy="3.5" r="1.8" />
      <circle cx="16.5" cy="3.7" r="1.45" />
      <circle cx="18.7" cy="5" r="1.2" />
      <circle cx="20.2" cy="6.9" r="1" />
    </>
  );
}

// Smooth cubic path through points (Catmull-Rom -> Bezier).
function catmullRom(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function JourneyFootTrail() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [d, setD] = useState("");
  const [feet, setFeet] = useState<Foot[]>([]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const path = pathRef.current;
    if (!wrap || !path) return;

    const compute = () => {
      const { width: w, height: h } = wrap.getBoundingClientRect();
      if (!w || !h) return;
      const L = w * 0.26;
      const R = w * 0.74;
      // 8 waypoints: snake route through the alternating bands (4 rows).
      const pts: [number, number][] = [
        [L, h * 0.1], // ill 1 (left)
        [R, h * 0.16], // content 1 (right)
        [L, h * 0.38], // content 2 (left)
        [R, h * 0.42], // ill 2 (right)
        [R, h * 0.6], // content 3 (right)
        [L, h * 0.65], // ill 3 (left)
        [L, h * 0.87], // content 4 (left)
        [R, h * 0.92], // ill 4 (right)
      ];
      const dd = catmullRom(pts);
      path.setAttribute("d", dd);
      const total = path.getTotalLength();
      const step = 78; // px between successive steps (stride length)
      const stride = 11; // px lateral offset from the centreline (two-track gait)
      const arr: Foot[] = [];
      let k = 0;
      for (let s = step * 0.6; s < total; s += step) {
        const p = path.getPointAtLength(s);
        const p2 = path.getPointAtLength(Math.min(s + 1, total));
        const dx = p2.x - p.x;
        const dy = p2.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        // unit normal (perpendicular to travel) -> offset left/right each step so
        // the prints straddle the path like real walking, not single file.
        const nx = -dy / len;
        const ny = dx / len;
        const side: 1 | -1 = k % 2 === 0 ? 1 : -1;
        arr.push({
          x: p.x + nx * stride * side,
          y: p.y + ny * stride * side,
          rot: (Math.atan2(dy, dx) * 180) / Math.PI + 90,
          side,
        });
        k++;
      }
      setD(dd);
      setFeet(arr);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0"
    >
      {/* faint dashed guide that the footprints follow */}
      <svg className="absolute inset-0 h-full w-full" fill="none">
        <path
          ref={pathRef}
          d={d}
          stroke="#4274D9"
          strokeOpacity="0.16"
          strokeWidth="2"
          strokeDasharray="1 11"
          strokeLinecap="round"
        />
      </svg>
      {feet.map((f, i) => (
        <svg
          key={i}
          viewBox="0 0 24 34"
          className="absolute text-[#4274D9]"
          style={{
            left: f.x,
            top: f.y,
            width: 20,
            height: 28,
            transform: `translate(-50%, -50%) rotate(${f.rot}deg) scaleX(${f.side})`,
          }}
          fill="currentColor"
          fillOpacity="0.5"
        >
          <FootShape />
        </svg>
      ))}
    </div>
  );
}
