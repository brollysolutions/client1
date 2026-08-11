"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminProperties, setPropertyActive, type AdminProperty } from "@/lib/properties-api";

export function ListingLifecyclePanel() {
  const [items, setItems] = React.useState<AdminProperty[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => { void getAdminProperties().then((result) => { setLoading(false); if (result.ok) setItems(result.data); else toast.error("Could not load listings", { description: result.error }); }); }, []);
  async function update(item: AdminProperty) {
    const active = !item.active;
    const reason = window.prompt(`Reason for ${active ? "publishing" : "unpublishing"} this listing:`);
    if (!reason?.trim()) return;
    setBusy(item.id);
    const result = await setPropertyActive(item.id, { active, reason: reason.trim() });
    setBusy(null);
    if (!result.ok) return toast.error("Could not update listing", { description: result.error });
    setItems((current) => current.map((entry) => entry.id === item.id ? result.data : entry));
  }
  if (loading) return <div className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…</div>;
  return <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-text-secondary"><tr><th className="px-4 py-3">Listing</th><th className="px-4 py-3">RERA</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b border-border last:border-0"><td className="px-4 py-3"><p className="font-medium text-text-primary">{item.title}</p><p className="text-xs text-text-secondary">{item.location}</p></td><td className="px-4 py-3 text-text-secondary">{item.rera_number}</td><td className="px-4 py-3"><Badge variant="outline">{item.active ? "Live" : "Hidden"}</Badge></td><td className="px-4 py-3"><Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => void update(item)}>{busy === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : item.active ? "Unpublish" : "Publish"}</Button></td></tr>)}</tbody></table></div>;
}
