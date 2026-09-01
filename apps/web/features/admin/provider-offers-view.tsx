"use client";

import * as React from "react";
import Image from "next/image";
import { ImageIcon, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DataTable,
  DataTablePrimaryCell,
  type DataColumn,
} from "@/features/dashboard/data-table";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  EMPTY_FILTERS,
  FilterBar,
  matchesSearch,
  type FilterBarValue,
} from "@/features/dashboard/filter-bar";
import { ListEmptyState, ListLoadingState, ListPagination } from "@/features/dashboard/list-states";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import { apiIssuesToFieldErrors, fieldErrorProps, focusFirstInvalidField, type FieldErrors } from "@/lib/form-validation";
import {
  getProviderPresentationState,
  isAvailable,
  type ProviderPresentationState,
} from "@/lib/loan-config";
import {
  createProviderOffer,
  listProviderOffers,
  setBankAvailability,
  updateProviderOffer,
  type AdminBank,
  type AdminLoanType,
  type AdminProviderOffer,
} from "@/lib/loan-config-api";
import {
  validateProviderOfferDraft,
  type ProviderOfferDraftValues,
  type ProviderOfferField,
} from "@/lib/provider-offer-validation";
import { useBankAvailability } from "./use-bank-availability";
import { useBanks } from "./use-banks";

type Draft = ProviderOfferDraftValues;

const STATUS_OPTIONS = [
  { value: "live", label: "Live on landing page" },
  { value: "draft", label: "Draft offer" },
  { value: "operational", label: "Operational only" },
  { value: "unavailable", label: "Unavailable" },
] as const;

function emptyDraft(product: AdminLoanType, provider: AdminBank): Draft {
  return {
    productId: product.id,
    providerId: provider.id,
    name: `${provider.name} ${product.label}`,
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
}

function draftFromOffer(offer: AdminProviderOffer): Draft {
  return {
    productId: offer.loan_type_id,
    providerId: offer.bank_id,
    name: offer.offer_name,
    summary: offer.summary ?? "",
    order: String(offer.display_order),
    minAmount: offer.min_amount ?? "",
    maxAmount: offer.max_amount ?? "",
    minRate: offer.min_interest_rate ?? "",
    maxRate: offer.max_interest_rate ?? "",
    minTenure: offer.min_tenure_months == null ? "" : String(offer.min_tenure_months),
    maxTenure: offer.max_tenure_months == null ? "" : String(offer.max_tenure_months),
    processingFee: offer.processing_fee_text ?? "",
    eligibility: offer.eligibility_summary ?? "",
    verifiedOn: offer.last_verified_at?.slice(0, 10) ?? "",
    published: offer.published,
  };
}

function optionalNumber(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

const STATE_META: Record<ProviderPresentationState, { label: string; tone: StatusTone }> = {
  live: { label: "Live on landing page", tone: "success" },
  draft: { label: "Draft offer", tone: "warning" },
  operational: { label: "Operational only", tone: "info" },
  unavailable: { label: "Unavailable", tone: "neutral" },
};

function stateFor(
  product: AdminLoanType,
  provider: AdminBank,
  offer: AdminProviderOffer | undefined,
  operational: boolean,
): ProviderPresentationState {
  return getProviderPresentationState({
    hasOffer: offer !== undefined,
    offerPublished: offer?.published ?? false,
    offerVerified: offer?.last_verified_at != null,
    productActive: product.active,
    productPublic: product.public_visible,
    providerActive: provider.active,
    operational,
  });
}

export function ProviderOffersView({ product }: { product: AdminLoanType }) {
  const { items: providers, loading: providersLoading, error: providersError, reload: reloadProviders } = useBanks();
  const { matrix, loading: matrixLoading, error: matrixError, reload: reloadMatrix } = useBankAvailability();
  const [offers, setOffers] = React.useState<AdminProviderOffer[]>([]);
  const [offersLoading, setOffersLoading] = React.useState(true);
  const [offersError, setOffersError] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [selected, setSelected] = React.useState<AdminBank | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors<ProviderOfferField>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [availabilityBusy, setAvailabilityBusy] = React.useState(false);
  const editorRef = React.useRef<HTMLDivElement>(null);

  const reloadOffers = React.useCallback(async () => {
    setOffersLoading(true);
    setOffersError(null);
    const response = await listProviderOffers();
    setOffersLoading(false);
    if (response.ok) setOffers(response.data.filter((offer) => offer.loan_type_id === product.id));
    else setOffersError(response.error);
  }, [product.id]);

  React.useEffect(() => {
    setSelected(null);
    setDraft(null);
    void reloadOffers();
  }, [reloadOffers]);

  const offerByProvider = React.useMemo(
    () => new Map(offers.map((offer) => [offer.bank_id, offer])),
    [offers],
  );

  const operationalFor = React.useCallback(
    (providerId: string) => isAvailable(matrix?.entries ?? [], providerId, product.id),
    [matrix?.entries, product.id],
  );

  const filteredProviders = React.useMemo(
    () =>
      providers.filter((provider) => {
        const offer = offerByProvider.get(provider.id);
        const state = stateFor(product, provider, offer, operationalFor(provider.id));
        if (
          filters.search &&
          !matchesSearch(
            `${provider.name} ${provider.legal_name ?? ""} ${provider.provider_type} ${offer?.offer_name ?? ""}`,
            filters.search,
          )
        ) {
          return false;
        }
        return filters.status === "all" || filters.status === state;
      }),
    [filters, offerByProvider, operationalFor, product, providers],
  );

  const page = useFilteredPage(filteredProviders, filters);
  const loading = providersLoading || matrixLoading || offersLoading;
  const loadError = providersError ?? matrixError ?? offersError;

  function selectProvider(provider: AdminBank) {
    const offer = offerByProvider.get(provider.id);
    setSelected(provider);
    setDraft(offer ? draftFromOffer(offer) : emptyDraft(product, provider));
    setFieldErrors({});
    setFormError(null);
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as ProviderOfferField];
      return next;
    });
    setFormError(null);
  }

  async function setOperational(available: boolean) {
    if (!selected) return;
    setAvailabilityBusy(true);
    const response = await setBankAvailability(selected.id, {
      entries: [{ loan_type_id: product.id, available }],
    });
    setAvailabilityBusy(false);
    if (!response.ok) {
      toast.error("Couldn't update operational availability", { description: response.error });
      return;
    }
    toast.success(available ? "Provider available to staff" : "Provider removed from staff assignment");
    void reloadMatrix();
  }

  async function saveOffer() {
    if (!draft || !selected) return;
    const errors = validateProviderOfferDraft(draft);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => {
        if (editorRef.current) focusFirstInvalidField(editorRef.current);
      });
      return;
    }
    const shared = {
      offer_name: draft.name.trim(),
      summary: draft.summary.trim() || null,
      published: draft.published,
      display_order: Number(draft.order),
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
    const existing = offerByProvider.get(selected.id);
    setBusy(true);
    const response = existing
      ? await updateProviderOffer(existing.id, shared)
      : await createProviderOffer({
          loan_type_id: product.id,
          bank_id: selected.id,
          ...shared,
        });
    setBusy(false);
    if (!response.ok) {
      setFieldErrors(
        apiIssuesToFieldErrors(response.issues, {
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
    toast.success(existing ? "Provider offer updated" : "Provider offer created");
    setDraft(draftFromOffer(response.data));
    void reloadOffers();
  }

  const columns = React.useMemo<readonly DataColumn<AdminBank>[]>(
    () => [
      {
        key: "provider",
        header: "Provider",
        render: (provider) => (
          <div className="flex items-center gap-3">
            <span className="relative flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
              {provider.logo_url && isAllowedAssetUrl(provider.logo_url) ? (
                <Image src={provider.logo_url} alt="" fill sizes="56px" className="object-contain p-1" />
              ) : (
                <ImageIcon className="h-4 w-4 text-text-secondary" aria-hidden="true" />
              )}
            </span>
            <DataTablePrimaryCell
              title={provider.name}
              subtitle={provider.provider_type.replaceAll("_", " ")}
            />
          </div>
        ),
      },
      {
        key: "operational",
        header: "Staff assignment",
        render: (provider) => (
          <StatusBadge tone={operationalFor(provider.id) ? "info" : "neutral"}>
            {operationalFor(provider.id) ? "Available" : "Unavailable"}
          </StatusBadge>
        ),
      },
      {
        key: "public",
        header: "Public state",
        render: (provider) => {
          const state = stateFor(
            product,
            provider,
            offerByProvider.get(provider.id),
            operationalFor(provider.id),
          );
          const meta = STATE_META[state];
          return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
        },
      },
    ],
    [offerByProvider, operationalFor, product],
  );

  const selectedOffer = selected ? offerByProvider.get(selected.id) : undefined;
  const canPublish = Boolean(product.active && product.public_visible && selected?.active);

  return (
    <div className="mx-auto max-w-[1320px] space-y-4 pb-6">
      <section className="rounded-xl border border-brand-cta/25 bg-brand-cta-tint p-4">
        <h2 className="font-semibold text-text-primary">One provider state, in one place</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Operational availability controls staff assignment. Only an explicit published offer
          with a verification date can appear publicly; a missing availability override never
          publishes a provider.
        </p>
      </section>

      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search providers for this product"
        searchPlaceholder="Provider or offer name"
        statusOptions={STATUS_OPTIONS}
        statusLabel="provider states"
        showLine={false}
        showDates={false}
      />

      {loading ? (
        <ListLoadingState rows={7} />
      ) : loadError ? (
        <FetchError
          status={null}
          message={loadError}
          onRetry={() => {
            void reloadProviders();
            void reloadMatrix();
            void reloadOffers();
          }}
        />
      ) : providers.length === 0 ? (
        <ListEmptyState
          icon={Landmark}
          title="No providers in the library"
          description="Add providers and verified logos from the Providers & logos surface first."
        />
      ) : (
        <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(26rem,1.05fr)]">
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            {filteredProviders.length === 0 ? (
              <ListEmptyState
                icon={Landmark}
                title="No providers match these filters"
                description="Clear or adjust the filters to return to the provider picker."
                className="m-4"
              />
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={page.pageRows}
                  rowKey={(provider) => provider.id}
                  onRowClick={selectProvider}
                  rowActionLabel="Configure provider"
                  minWidth="min-w-[650px]"
                />
                <div className="px-4 pb-4">
                  <ListPagination page={page.page} total={page.total} onPageChange={page.setPage} />
                </div>
              </>
            )}
          </section>

          <aside className="min-w-0 xl:sticky xl:top-0 xl:self-start">
            {selected && draft ? (
              <div ref={editorRef} className="space-y-5 rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h2 className="font-semibold text-text-primary">{selected.name}</h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      {selectedOffer ? "Edit its product-specific offer." : "Create its first draft offer."}
                    </p>
                  </div>
                  <StatusBadge tone={selected.active ? "success" : "neutral"}>
                    {selected.active ? "Provider active" : "Provider disabled"}
                  </StatusBadge>
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3">
                  <Checkbox
                    id={`operational-${selected.id}`}
                    checked={operationalFor(selected.id)}
                    disabled={availabilityBusy}
                    onCheckedChange={(checked) => void setOperational(checked === true)}
                  />
                  <div>
                    <Label htmlFor={`operational-${selected.id}`} className="font-normal">
                      Operationally available to staff
                    </Label>
                    <p className="mt-1 text-xs leading-5 text-text-secondary">
                      This affects assignment only. It does not make the provider public.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="product-provider-offer-name">
                      Offer label
                      <RequiredIndicator />
                    </Label>
                    <Input
                      id="product-provider-offer-name"
                      value={draft.name}
                      maxLength={160}
                      onChange={(event) => update("name", event.target.value)}
                      {...fieldErrorProps("product-provider-offer-name-error", fieldErrors.name)}
                    />
                    <FieldError id="product-provider-offer-name-error">{fieldErrors.name}</FieldError>
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="product-provider-summary">Public summary</Label>
                    <Textarea
                      id="product-provider-summary"
                      value={draft.summary}
                      rows={3}
                      maxLength={500}
                      onChange={(event) => update("summary", event.target.value)}
                      {...fieldErrorProps("product-provider-summary-error", fieldErrors.summary)}
                    />
                    <FieldError id="product-provider-summary-error">{fieldErrors.summary}</FieldError>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="product-provider-order">Display order</Label>
                    <Input
                      id="product-provider-order"
                      type="number"
                      min={0}
                      max={10_000}
                      value={draft.order}
                      onChange={(event) => update("order", event.target.value)}
                      {...fieldErrorProps("product-provider-order-error", fieldErrors.order)}
                    />
                    <FieldError id="product-provider-order-error">{fieldErrors.order}</FieldError>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="product-provider-verified">Last verified on</Label>
                    <Input
                      id="product-provider-verified"
                      type="date"
                      value={draft.verifiedOn}
                      onChange={(event) => update("verifiedOn", event.target.value)}
                      {...fieldErrorProps("product-provider-verified-error", fieldErrors.verifiedOn)}
                    />
                    <FieldError id="product-provider-verified-error">{fieldErrors.verifiedOn}</FieldError>
                  </div>
                  {(
                    [
                      ["minAmount", "Minimum amount", "0.01", 999_999_999_999.99],
                      ["maxAmount", "Maximum amount", "0.01", 999_999_999_999.99],
                      ["minRate", "Minimum interest rate (%)", "0.001", 100],
                      ["maxRate", "Maximum interest rate (%)", "0.001", 100],
                      ["minTenure", "Minimum tenure (months)", "1", 600],
                      ["maxTenure", "Maximum tenure (months)", "1", 600],
                    ] as const
                  ).map(([key, label, step, max]) => (
                    <div key={key} className="grid gap-1.5">
                      <Label htmlFor={`product-provider-${key}`}>{label}</Label>
                      <Input
                        id={`product-provider-${key}`}
                        type="number"
                        min={key.includes("Tenure") ? 1 : 0}
                        max={max}
                        step={step}
                        value={draft[key]}
                        onChange={(event) => update(key, event.target.value)}
                        {...fieldErrorProps(`product-provider-${key}-error`, fieldErrors[key])}
                      />
                      <FieldError id={`product-provider-${key}-error`}>{fieldErrors[key]}</FieldError>
                    </div>
                  ))}
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="product-provider-fee">Processing fee</Label>
                    <Input
                      id="product-provider-fee"
                      value={draft.processingFee}
                      maxLength={240}
                      onChange={(event) => update("processingFee", event.target.value)}
                      {...fieldErrorProps("product-provider-fee-error", fieldErrors.processingFee)}
                    />
                    <FieldError id="product-provider-fee-error">{fieldErrors.processingFee}</FieldError>
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="product-provider-eligibility">Eligibility note</Label>
                    <Textarea
                      id="product-provider-eligibility"
                      value={draft.eligibility}
                      rows={3}
                      maxLength={500}
                      onChange={(event) => update("eligibility", event.target.value)}
                      {...fieldErrorProps("product-provider-eligibility-error", fieldErrors.eligibility)}
                    />
                    <FieldError id="product-provider-eligibility-error">{fieldErrors.eligibility}</FieldError>
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-border p-3">
                  <Checkbox
                    id="product-provider-published"
                    checked={draft.published}
                    disabled={!canPublish && !draft.published}
                    onCheckedChange={(checked) => update("published", checked === true)}
                  />
                  <div>
                    <Label htmlFor="product-provider-published" className="font-normal">
                      Live on the public product page
                    </Label>
                    <p className="mt-1 text-xs leading-5 text-text-secondary">
                      {canPublish
                        ? "Requires a verification date. Public display never follows operational availability."
                        : "Activate and publish the product, and activate this provider, before publishing its offer."}
                    </p>
                  </div>
                </div>

                {formError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                ) : null}
                <div className="flex justify-end">
                  <Button onClick={() => void saveOffer()} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {selectedOffer ? "Save offer" : "Create draft offer"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
                <Landmark className="mx-auto h-6 w-6 text-text-secondary" aria-hidden="true" />
                <h2 className="mt-3 font-semibold text-text-primary">Select a provider</h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  Its operational availability and product-specific public offer will open here.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
