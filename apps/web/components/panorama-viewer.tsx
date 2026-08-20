"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Rotate3D } from "lucide-react";

import { Button } from "@/components/ui/button";

type DragState = { pointerId: number; startX: number; startYaw: number };

function normalizeYaw(value: number): number {
  return ((value % 100) + 100) % 100;
}

export function PanoramaViewer({ src, title }: { src: string; title: string }) {
  const [yaw, setYaw] = React.useState(50);
  const drag = React.useRef<DragState | null>(null);
  const move = React.useCallback((amount: number) => {
    setYaw((value) => normalizeYaw(value + amount));
  }, []);

  return (
    <figure className="space-y-2">
      <div
        role="group"
        aria-label={`${title} interactive 360 degree panorama`}
        tabIndex={0}
        className="relative aspect-[2/1] cursor-grab select-none overflow-hidden rounded-xl bg-muted outline-none ring-brand-blue focus-visible:ring-2 active:cursor-grabbing"
        style={{
          backgroundImage: `url(${JSON.stringify(src)})`,
          backgroundPosition: `${yaw}% center`,
          backgroundRepeat: "repeat-x",
          backgroundSize: "200% auto",
          touchAction: "none",
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            move(event.key === "ArrowLeft" ? -4 : 4);
          }
        }}
        onPointerDown={(event) => {
          if (event.target instanceof Element && event.target.closest("button")) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, startX: event.clientX, startYaw: yaw };
        }}
        onPointerMove={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          const width = event.currentTarget.getBoundingClientRect().width || 1;
          const delta = ((event.clientX - drag.current.startX) / width) * 100;
          setYaw(normalizeYaw(drag.current.startYaw - delta));
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId === event.pointerId) drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/65 to-transparent p-3 pt-10">
          <Button type="button" size="icon" variant="outline" aria-label="Pan panorama left" onClick={() => move(-8)}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white">
            <Rotate3D className="h-4 w-4" aria-hidden /> 360° view
          </span>
          <Button type="button" size="icon" variant="outline" aria-label="Pan panorama right" onClick={() => move(8)}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
      <figcaption className="text-xs text-text-secondary">
        Drag horizontally or use the arrow keys to explore the panorama.
      </figcaption>
    </figure>
  );
}
