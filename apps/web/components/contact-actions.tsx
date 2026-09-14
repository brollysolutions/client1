import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isValidMobile, toE164, toWaHref } from "@/lib/phone";

export function WhatsAppIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true"><path d="M16.04 3A12.9 12.9 0 0 0 5.02 22.62L3.1 29l6.53-1.87A12.98 12.98 0 1 0 16.04 3Zm0 23.75a10.72 10.72 0 0 1-5.47-1.5l-.39-.23-3.88 1.11 1.04-3.78-.25-.39a10.73 10.73 0 1 1 8.95 4.79Zm5.89-8.04c-.32-.16-1.91-.94-2.2-1.05-.3-.11-.51-.16-.73.16-.21.32-.83 1.05-1.02 1.27-.19.21-.38.24-.7.08-.32-.16-1.36-.5-2.59-1.6-.96-.85-1.6-1.9-1.79-2.22-.19-.32-.02-.5.14-.66.15-.14.32-.38.49-.57.16-.19.21-.32.32-.54.11-.21.05-.4-.03-.56-.08-.16-.73-1.75-1-2.4-.26-.63-.53-.55-.73-.56h-.62c-.22 0-.57.08-.87.4-.29.32-1.12 1.1-1.12 2.67 0 1.58 1.15 3.1 1.31 3.31.16.22 2.26 3.45 5.48 4.84.76.33 1.36.53 1.83.68.77.24 1.47.21 2.02.13.62-.09 1.91-.78 2.18-1.53.27-.75.27-1.39.19-1.53-.08-.13-.3-.21-.62-.37Z" /></svg>;
}

/** The caller must first enforce the API's contact visibility mode. */
export function ContactActions({ mobile, name = "contact" }: { mobile: string; name?: string }) {
  if (!isValidMobile(mobile)) return null;
  return <div className="flex flex-wrap items-center gap-2">
    <Button asChild variant="outline" className="min-h-11 bg-transparent"><a href={`tel:${toE164(mobile)}`} aria-label={`Call ${name}`}><Phone aria-hidden="true" />Call</a></Button>
    <Button asChild variant="outline" className="min-h-11 bg-transparent"><a href={toWaHref(mobile)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${name}`}><WhatsAppIcon className="h-5 w-5 text-success" />WhatsApp</a></Button>
  </div>;
}
