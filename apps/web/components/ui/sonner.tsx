"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      // Semantic tints (green success / red error). Toasts auto-dismiss after
      // their duration (~4s); no manual close button.
      richColors
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          // items-start keeps the icon aligned to the title row instead of
          // floating centred between the title and description.
          toast:
            "!items-start !rounded-xl !border !shadow-lg !gap-3 !p-4 backdrop-blur-sm",
          content: "!gap-1",
          title: "!font-heading !font-semibold !text-[0.95rem] !leading-snug",
          description: "!text-sm !opacity-90 !leading-snug",
          icon: "!mt-0.5 !self-start",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
