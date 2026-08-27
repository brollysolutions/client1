"use client";

import * as React from "react";
import { Inbox, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  apiIssuesToFieldErrors,
  fieldErrorProps,
  focusFirstInvalidField,
  type FieldErrors,
} from "@/lib/form-validation";
import {
  createProviderOffer,
  listProviderOffers,
  updateProviderOffer,
  type AdminProviderOffer,
} from "@/lib/loan-config-api";
import {
  validateProviderOfferDraft,
  type ProviderOfferDraftValues,
  type ProviderOfferField,
} from "@/lib/provider-offer-validation";
import { useBanks } from "./use-banks";
import { useLoanTypes } from "./use-loan-types";

type Draft = ProviderOfferDraftValues;

const EMPTY: Draft = {
  productId: "",
  providerId: "",
  name: "",
  summary: "",
  order: "1000",
  minAmount: "",
  maxAmount: "",
  minRate: "",
  maxRate: "",
  minTenure: "",
  maxTenure: "",
  processingFee: "",
  eligibility: "",
  verifiedOn: "",
  published: false,
};

const OFFERS_PER_PAGE = 12;

function optionalNumber(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

export function ProviderOffersView() {
  const { items: products } = useLoanTypes();
  const { items: providers } = useBanks();
  const [offers, setOffers] = React.useState<AdminProviderOffer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [active, setActive] = React.useState<AdminProviderOffer | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors<ProviderOfferField>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const response = await listProviderOffers();
    setLoading(false);
    if (response.ok) setOffers(response.data);
    else {
      setLoadError(response.error);
      toast.error("Couldn't load provider offers", { description: response.error });
    }
  }, []);

  const filteredOffers = React.useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en-IN");
    if (!normalized) return offers;
    return offers.filter((offer) =>
      [offer.offer_name, offer.product_label, offer.provider_name].some((value) =>
        value.toLocaleLowerCase("en-IN").includes(normalized),
      ),
    );
  }, [offers, query]);
  const pageCount = Math.max(1, Math.ceil(filteredOffers.length / OFFERS_PER_PAGE));
  const visibleOffers = filteredOffers.slice(
    (page - 1) * OFFERS_PER_PAGE,
    page * OFFERS_PER_PAGE,
  );

  React.useEffect(() => {
    void reload();
  }, [reload]);

  function openCreate() {
    setActive(null);
    setDraft(EMPTY);
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(offer: AdminProviderOffer) {
    setActive(offer);
    setDraft({
      productId: offer.loan_type_id,
      providerId: offer.bank_id,
      name: offer.offer_name,
      summary: offer.summary ?? "",
      order: String(offer.display_order),
      minAmount: offer.min_amount === null ? "" : String(offer.min_amount),
      maxAmount: offer.max_amount === null ? "" : String(offer.max_amount),
      minRate: offer.min_interest_rate === null ? "" : String(offer.min_interest_rate),
      maxRate: offer.max_interest_rate === null ? "" : String(offer.max_interest_rate),
      minTenure: offer.min_tenure_months === null ? "" : String(offer.min_tenure_months),
      maxTenure: offer.max_tenure_months === null ? "" : String(offer.max_tenure_months),
      processingFee: offer.processing_fee_text ?? "",
      eligibility: offer.eligibility_summary ?? "",
      verifiedOn: toDateInput(offer.last_verified_at),
      published: offer.published,
    });
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as ProviderOfferField];
      return next;
    });
    setFormError(null);
  }

  async function save() {
    const errors = validateProviderOfferDraft(draft);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => {
        if (dialogRef.current) focusFirstInvalidField(dialogRef.current);
      });
      return;
    }
    const displayOrder = Number(draft.order);
    const shared = {
      offer_name: draft.name.trim(),
      summary: draft.summary.trim() || null,
      published: draft.published,
      display_order: displayOrder,
      min_amount: optionalNumber(draft.minAmount),
      max_amount: optionalNumber(draft.maxAmount),
      min_interest_rate: optionalNumber(draft.minRate),
      max_interest_rate: optionalNumber(draft.maxRate),
      min_tenure_months: optionalNumber(draft.minTenure),
      max_tenure_months: optionalNumber(draft.maxTenure),
      processing_fee_text: draft.processingFee.trim() || null,
      eligibility_summary: draft.eligibility.trim() || null,
      last_verified_at: draft.verifiedOn
        ? new Date(`${draft.verifiedOn}T00:00:00.000Z`).toISOString()
        : null,
    };
    setBusy(true);
    const response = active
      ? await updateProviderOffer(active.id, shared)
      : await createProviderOffer({
          loan_type_id: draft.productId,
          bank_id: draft.providerId,
          ...shared,
        });
    setBusy(false);
    if (!response.ok) {
      setFieldErrors(
        apiIssuesToFieldErrors(response.issues, {
          loan_type_id: "productId",
          bank_id: "providerId",
          offer_name: "name",
          summary: "summary",
          display_order: "order",
          min_amount: "minAmount",
          max_amount: "maxAmount",
          min_interest_rate: "minRate",
          max_interest_rate: "maxRate",
          min_tenure_months: "minTenure",
          max_tenure_months: "maxTenure",
          processing_fee_text: "processingFee",
          eligibility_summary: "eligibility",
          last_verified_at: "verifiedOn",
        }),
      );
      setFormError(response.error);
      toast.error("Couldn't save provider offer", { description: response.error });
      return;
    }
    toast.success(active ? "Provider offer updated" : "Provider offer added");
    setDialogOpen(false);
    void reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <p className="text-sm text-text-secondary">
          Explicit public product-provider options. Missing operational availability never
          publishes a provider here, and no offer can contain an external lender link.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden />
          New offer
        </Button>
      </div>

      {offers.length > 0 ? (
        <div className="grid max-w-md gap-1.5">
          <Label htmlFor="provider-offer-search">Search offers</Label>
          <Input
            id="provider-offer-search"
            type="search"
            value={query}
            maxLength={100}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Product, provider, or offer"
          />
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden />
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{loadError}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : offers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Inbox className="mx-auto h-8 w-8 text-text-secondary" aria-hidden />
          <p className="mt-3 font-medium text-text-primary">No provider offers yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            Add one after its provider identity and current terms have been verified.
          </p>
        </div>
      ) : filteredOffers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium text-text-primary">No offers match that search</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setQuery("")}
          >
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {visibleOffers.map((offer) => (
              <li key={offer.id}>
                <button
                  type="button"
                  onClick={() => openEdit(offer)}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-cta/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text-primary">{offer.offer_name}</p>
                    <p className="mt-1 truncate text-xs text-text-secondary">
                      {offer.product_label} · {offer.provider_name} · order #{offer.display_order}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {offer.last_verified_at
                        ? `Verified ${new Date(offer.last_verified_at).toLocaleDateString("en-IN")}`
                        : "Not verified"}
                    </p>
                  </div>
                  <Badge variant={offer.published ? "default" : "outline"}>
                    {offer.published ? "Published" : "Draft"}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
          {pageCount > 1 ? (
            <nav className="flex items-center justify-between gap-3" aria-label="Provider offers pages">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="text-xs tabular-nums text-text-secondary">
                Page {page} of {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent ref={dialogRef} className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{active ? "Edit provider offer" : "New provider offer"}</DialogTitle>
            <DialogDescription>
              Public terms are informational and must be re-verified when they change.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="offer-product">Financial product <RequiredIndicator /></Label>
              <select id="offer-product" value={draft.productId} onChange={(event) => update("productId", event.target.value)} disabled={Boolean(active)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" {...fieldErrorProps("offer-product-error", fieldErrors.productId)}>
                <option value="">Choose product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.label}{product.public_visible ? "" : " (not public)"}</option>)}
              </select>
              <FieldError id="offer-product-error">{fieldErrors.productId}</FieldError>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="offer-provider">Provider <RequiredIndicator /></Label>
              <select id="offer-provider" value={draft.providerId} onChange={(event) => update("providerId", event.target.value)} disabled={Boolean(active)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" {...fieldErrorProps("offer-provider-error", fieldErrors.providerId)}>
                <option value="">Choose provider</option>
                {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}{provider.active ? "" : " (disabled)"}</option>)}
              </select>
              <FieldError id="offer-provider-error">{fieldErrors.providerId}</FieldError>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="offer-name">Offer label <RequiredIndicator /></Label>
              <Input id="offer-name" value={draft.name} onChange={(event) => update("name", event.target.value)} maxLength={160} {...fieldErrorProps("offer-name-error", fieldErrors.name)} />
              <FieldError id="offer-name-error">{fieldErrors.name}</FieldError>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="offer-order">Display order <RequiredIndicator /></Label>
              <Input id="offer-order" type="number" min={0} max={10000} step={1} value={draft.order} onChange={(event) => update("order", event.target.value)} {...fieldErrorProps("offer-order-error", fieldErrors.order)} />
              <FieldError id="offer-order-error">{fieldErrors.order}</FieldError>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="offer-summary">Public summary</Label>
              <Textarea id="offer-summary" value={draft.summary} onChange={(event) => update("summary", event.target.value)} maxLength={500} rows={3} {...fieldErrorProps("offer-summary-error", fieldErrors.summary)} />
              <FieldError id="offer-summary-error">{fieldErrors.summary}</FieldError>
            </div>
            {([
              ["minAmount", "Minimum amount", "number"],
              ["maxAmount", "Maximum amount", "number"],
              ["minRate", "Minimum interest rate (%)", "number"],
              ["maxRate", "Maximum interest rate (%)", "number"],
              ["minTenure", "Minimum tenure (months)", "number"],
              ["maxTenure", "Maximum tenure (months)", "number"],
            ] as const).map(([key, label, type]) => (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={`offer-${key}`}>{label}</Label>
                <Input id={`offer-${key}`} type={type} min={key.includes("Tenure") ? 1 : 0} max={key.includes("Rate") ? 100 : key.includes("Tenure") ? 600 : 999999999999.99} step={key.includes("Rate") ? "0.001" : key.includes("Amount") ? "0.01" : "1"} value={draft[key]} onChange={(event) => update(key, event.target.value)} {...fieldErrorProps(`offer-${key}-error`, fieldErrors[key])} />
                <FieldError id={`offer-${key}-error`}>{fieldErrors[key]}</FieldError>
              </div>
            ))}
            <div className="grid gap-1.5">
              <Label htmlFor="offer-fee">Processing fee</Label>
              <Input id="offer-fee" value={draft.processingFee} onChange={(event) => update("processingFee", event.target.value)} maxLength={240} {...fieldErrorProps("offer-fee-error", fieldErrors.processingFee)} />
              <FieldError id="offer-fee-error">{fieldErrors.processingFee}</FieldError>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="offer-verified">Last verified on</Label>
              <Input id="offer-verified" type="date" value={draft.verifiedOn} onChange={(event) => update("verifiedOn", event.target.value)} {...fieldErrorProps("offer-verified-error", fieldErrors.verifiedOn)} />
              <FieldError id="offer-verified-error">{fieldErrors.verifiedOn}</FieldError>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="offer-eligibility">Eligibility note</Label>
              <Textarea id="offer-eligibility" value={draft.eligibility} onChange={(event) => update("eligibility", event.target.value)} maxLength={500} rows={3} {...fieldErrorProps("offer-eligibility-error", fieldErrors.eligibility)} />
              <FieldError id="offer-eligibility-error">{fieldErrors.eligibility}</FieldError>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="offer-published" checked={draft.published} onCheckedChange={(checked) => update("published", checked === true)} />
              <Label htmlFor="offer-published" className="font-normal">
                Publish on the product page
              </Label>
            </div>
          </div>
          {formError ? <p className="text-sm text-destructive" role="alert">{formError}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save offer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
