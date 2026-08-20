"use client";

import Image from "next/image";
import { Images, Rotate3D } from "lucide-react";

import { PanoramaViewer } from "@/components/panorama-viewer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PropertyMediaItem } from "@/lib/properties";

export function PropertyMediaDialog({
  title,
  media,
}: {
  title: string;
  media: PropertyMediaItem[];
}) {
  if (media.length === 0) return null;
  const hasPanorama = media.some((item) => item.kind === "panorama");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="w-full">
          {hasPanorama ? <Rotate3D className="h-4 w-4" /> : <Images className="h-4 w-4" />}
          {hasPanorama ? "Photos and 360° view" : "View photos"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Approved listing media</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-4 sm:grid-cols-2">
          {media.map((item, index) => (
            <li key={`${item.url}-${index}`} className="overflow-hidden rounded-xl border border-border bg-muted">
              {item.kind === "panorama" ? (
                <div className="p-2">
                  <PanoramaViewer src={item.url} title={title} />
                </div>
              ) : (
                <div className="relative aspect-video">
                  <Image src={item.url} alt={`${title}, image ${index + 1}`} fill unoptimized className="object-cover" />
                </div>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
