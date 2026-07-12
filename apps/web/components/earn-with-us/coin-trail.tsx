"use client";

import { useEffect, useRef, useState } from "react";

// Decorative curvy money trail overlaid behind the earn commission bands (lg+
// only): gold rupee coins travelling the same snake route the loans journey
// walks with footprints (components/journey-foot-trail.tsx). Same technique:
// measure the overlay with a ResizeObserver, build a smooth Catmull-Rom path
// through the band waypoints, then sample evenly spaced points for the coins.
// The lead becomes money, so the trail ends in a small coin burst at the last
// band. Client component: needs layout measurement. Decorative (aria-hidden),
// natural gold coins per docs/design/illustration-style.md, low opacity.

type Coin = { x: number; y: number; r: number; big: boolean };

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

export function CoinTrail() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [d, setD] = useState("");
  const [coins, setCoins] = useState<Coin[]>([]);
  const [end, setEnd] = useState<[number, number] | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const path = pathRef.current;
    if (!wrap || !path) return;

    const compute = () => {
      const { width: w, height: h } = wrap.getBoundingClientRect();
      if (!w || !h) return;
      const L = w * 0.26;
      const R = w * 0.74;
      // Same snake route as the loans journey trail (4 alternating rows).
      const pts: [number, number][] = [
        [L, h * 0.1],
        [R, h * 0.16],
        [L, h * 0.38],
        [R, h * 0.42],
        [R, h * 0.6],
        [L, h * 0.65],
        [L, h * 0.87],
        [R, h * 0.92],
      ];
      const dd = catmullRom(pts);
      path.setAttribute("d", dd);
      const total = path.getTotalLength();
      const step = 92; // px between successive coins
      const arr: Coin[] = [];
      let k = 0;
      for (let s = step * 0.5; s < total - 40; s += step) {
        const p = path.getPointAtLength(s);
        arr.push({
          x: p.x,
          y: p.y,
          // small size rhythm so the trail reads hand-placed, not stamped
          r: k % 3 === 0 ? 11 : 8,
          big: k % 3 === 0,
        });
        k++;
      }
      const pEnd = path.getPointAtLength(total);
      setD(dd);
      setCoins(arr);
      setEnd([pEnd.x, pEnd.y]);
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
      <svg className="absolute inset-0 h-full w-full" fill="none">
        {/* faint dashed guide the coins follow */}
        <path
          ref={pathRef}
          d={d}
          stroke="#C08A2E"
          strokeOpacity="0.22"
          strokeWidth="2"
          strokeDasharray="1 11"
          strokeLinecap="round"
        />
        {coins.map((c, i) => (
          <g key={i} opacity={c.big ? 0.55 : 0.42}>
            <circle cx={c.x} cy={c.y} r={c.r} fill="#E8B54D" stroke="#C08A2E" strokeWidth="1.6" />
            {c.big ? (
              <text
                x={c.x}
                y={c.y + 4}
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
                fontSize="11"
                fontWeight={700}
                fill="#6B4E16"
              >
                &#8377;
              </text>
            ) : null}
          </g>
        ))}
        {/* end burst: the trail pays out */}
        {end ? (
          <g opacity="0.55" transform={`translate(${end[0]} ${end[1]})`}>
            <circle r="13" fill="#E8B54D" stroke="#C08A2E" strokeWidth="1.8" />
            <text
              x="0"
              y="4.5"
              textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              fontSize="12"
              fontWeight={700}
              fill="#6B4E16"
            >
              &#8377;
            </text>
            <g stroke="#C08A2E" strokeWidth="2" strokeLinecap="round">
              <path d="M-22 -14 l-5 -5 M22 -14 l5 -5 M-25 6 l-7 2 M25 6 l7 2 M0 -22 l0 -7" />
            </g>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
