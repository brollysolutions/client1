"use client";

import * as React from "react";
import { PackageOpen, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardPanel } from "@/features/dashboard/dashboard-ui";
import {
  DataTable,
  DataTablePrimaryCell,
  nextSort,
  type DataColumn,
  type SortState,
} from "@/features/dashboard/data-table";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  EMPTY_FILTERS,
  FilterBar,
  matchesSearch,
  type FilterBarValue,
} from "@/features/dashboard/filter-bar";
import { ListEmptyState, ListLoadingState, ListPagination } from "@/features/dashboard/list-states";
import { StatusBadge } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import { getProviderPresentationState } from "@/lib/loan-config";
import {
  createLoanType,
  listProviderOffers,
  type AdminLoanType,
  type AdminProviderOffer,
  type ProductCategory,
  type ProductFormDefinition,
} from "@/lib/loan-config-api";
import { formatLastUpdated } from "@/lib/format";
import { focusFirstInvalidField, integerError, requiredTextError } from "@/lib/form-validation";
import { FinancialProductWorkspace } from "./financial-product-workspace";
import { useBanks } from "./use-banks";
import { useLoanTypes } from "./use-loan-types";

const CATEGORY_LABEL: Record<ProductCategory, string> = {
  loan: "Loan or funding",
  credit_card: "Credit card",
  insurance: "Insurance",
};

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
  { value: "public", label: "Public" },
  { value: "dashboard", label: "Dashboard only" },
] as const;

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({
  value,
  label,
}));

function starterForm(category: ProductCategory): ProductFormDefinition {
  const field =
    category === "loan"
      ? { key: "requested_amount", label: "Requested Loan Amount", input_type: "currency" as const }
      : category === "credit_card"
        ? {
            key: "income_source",
            label: "Primary Income Source",
            input_type: "select" as const,
            options: [
              { value: "salaried", label: "Salaried" },
              { value: "self_employed", label: "Self-employed" },
            ],
          }
        : { key: "coverage_amount", label: "Preferred Sum Insured", input_type: "currency" as const };
  return {
    sections: [
      {
        key: "application_details",
        title: "Application Details",
        description: null,
        fields: [{ ...field, required: true, options: "options" in field ? field.options : [] }],
      },
    ],
  };
}

export function LoanTypesView() {
  const { items, loading, error, reload } = useLoanTypes();
  const { items: providers } = useBanks();
  const [offers, setOffers] = React.useState<AdminProviderOffer[]>([]);
  const [offersLoaded, setOffersLoaded] = React.useState(false);
  const [active, setActive] = React.useState<AdminLoanType | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [newCategory, setNewCategory] = React.useState<ProductCategory>("loan");
  const [newOrder, setNewOrder] = React.useState("1000");
  const [busy, setBusy] = React.useState(false);
  const [createErrors, setCreateErrors] = React.useState<Record<string, string>>({});
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ key: "order", dir: "asc" });
  const createFormRef = React.useRef<HTMLFormElement>(null);

  const reloadOffers = React.useCallback(async () => {
    const response = await listProviderOffers();
    if (response.ok) setOffers(response.data);
    setOffersLoaded(response.ok);
  }, []);

  React.useEffect(() => {
    void reloadOffers();
  }, [reloadOffers]);

  const activeProviderIds = React.useMemo(
    () => new Set(providers.filter((provider) => provider.active).map((provider) => provider.id)),
    [providers],
  );

  const liveProviderCount = React.useCallback(
    (product: AdminLoanType) =>
      offers.filter(
        (offer) =>
          offer.loan_type_id === product.id &&
          getProviderPresentationState({
            hasOffer: true,
            offerPublished: offer.published,
            offerVerified: offer.last_verified_at != null,
            productActive: product.active,
            productPublic: product.public_visible,
            providerActive: activeProviderIds.has(offer.bank_id),
            operational: false,
          }) === "live",
      ).length,
    [activeProviderIds, offers],
  );

  const filtered = React.useMemo(() => {
    const rows = items.filter((product) => {
      if (
        filters.search &&
        !matchesSearch(`${product.label} ${product.name} ${CATEGORY_LABEL[product.category]}`, filters.search)
      ) {
        return false;
      }
      if (filters.kind !== "all" && product.category !== filters.kind) return false;
      if (filters.status === "active" && !product.active) return false;
      if (filters.status === "disabled" && product.active) return false;
      if (filters.status === "public" && !product.public_visible) return false;
      if (filters.status === "dashboard" && product.public_visible) return false;
      return true;
    });
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const leftSubmissions = left.application_count + left.enquiry_count;
      const rightSubmissions = right.application_count + right.enquiry_count;
      const result =
        sort.key === "label"
          ? left.label.localeCompare(right.label)
          : sort.key === "category"
            ? CATEGORY_LABEL[left.category].localeCompare(CATEGORY_LABEL[right.category])
            : sort.key === "version"
              ? left.form_version - right.form_version
              : sort.key === "submissions"
                ? leftSubmissions - rightSubmissions
                : sort.key === "providers"
                  ? liveProviderCount(left) - liveProviderCount(right)
                  : left.display_order - right.display_order;
      return result * direction || left.label.localeCompare(right.label);
    });
  }, [filters, items, liveProviderCount, sort]);

  const page = useFilteredPage(filtered, [filters, sort]);

  const columns = React.useMemo<readonly DataColumn<AdminLoanType>[]>(
    () => [
      {
        key: "label",
        header: "Product",
        sortable: true,
        render: (product) => (
          <DataTablePrimaryCell
            title={product.label}
            subtitle={`${formatLastUpdated(product.updated_at)} · order #${product.display_order}`}
          />
        ),
      },
      {
        key: "category",
        header: "Category",
        sortable: true,
        render: (product) => CATEGORY_LABEL[product.category],
      },
      {
        key: "version",
        header: "Form",
        sortable: true,
        render: (product) => <span className="tabular-nums">v{product.form_version}</span>,
      },
      {
        key: "submissions",
        header: "Submissions",
        sortable: true,
        align: "right",
        render: (product) => (
          <span className="tabular-nums">{product.application_count + product.enquiry_count}</span>
        ),
      },
      {
        key: "providers",
        header: "Providers live",
        sortable: true,
        align: "right",
        render: (product) => (
          <span className="tabular-nums">{offersLoaded ? liveProviderCount(product) : "—"}</span>
        ),
      },
      {
        key: "state",
        header: "State",
        render: (product) => (
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge tone={product.active ? "success" : "neutral"}>
              {product.active ? "Active" : "Disabled"}
            </StatusBadge>
            <StatusBadge tone={product.public_visible ? "info" : "neutral"}>
              {product.public_visible ? "Public" : "Dashboard only"}
            </StatusBadge>
          </div>
        ),
      },
    ],
    [liveProviderCount, offersLoaded],
  );

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    const order = Number(newOrder);
    const next: Record<string, string> = {};
    const labelError = requiredTextError(newLabel, "Product name", 200);
    const orderError = integerError(newOrder, "Display order", {
      required: true,
      min: 0,
      max: 10_000,
    });
    if (labelError) next.label = labelError;
    if (orderError) next.order = orderError;
    setCreateErrors(next);
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => {
        if (createFormRef.current) focusFirstInvalidField(createFormRef.current);
      });
      return;
    }
    setBusy(true);
    const response = await createLoanType({
      label: newLabel.trim(),
      category: newCategory,
      display_order: order,
      form_schema: starterForm(newCategory),
    });
    setBusy(false);
    if (!response.ok) {
      toast.error("Couldn't add financial product", { description: response.error });
      return;
    }
    toast.success("Financial product added");
    setNewLabel("");
    setNewCategory("loan");
    setNewOrder("1000");
    setCreating(false);
    setActive(response.data);
    void reload();
  }

  return (
    <>
      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search financial products"
        searchPlaceholder="Search product or category"
        statusOptions={STATUS_OPTIONS}
        statusLabel="states"
        kindOptions={CATEGORY_OPTIONS}
        kindLabel="Categories"
        showLine={false}
        showDates={false}
        note="Select a row to configure its form, providers, and public-page state."
      />

      <DashboardPanel
        title="Financial products"
        description="One catalogue powers client applications and the public Financial Services pages."
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New product
          </Button>
        }
        bodyClassName="p-0"
      >
        {loading ? (
          <div className="p-5">
            <ListLoadingState rows={7} />
          </div>
        ) : error ? (
          <div className="p-5">
            <FetchError status={null} message={error} onRetry={() => void reload()} />
          </div>
        ) : filtered.length === 0 ? (
          <ListEmptyState
            icon={PackageOpen}
            title={items.length === 0 ? "No financial products yet" : "No products match these filters"}
            description={
              items.length === 0
                ? "Add the first product, then configure its versioned client form."
                : "Clear or adjust the filters to return to the catalogue."
            }
            className="m-5"
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={page.pageRows}
              rowKey={(product) => product.id}
              sort={sort}
              onSortChange={(key) => setSort((current) => nextSort(current, key))}
              onRowClick={setActive}
              rowActionLabel="Open product workspace"
              minWidth="min-w-[920px]"
            />
            <div className="px-5 pb-5">
              <ListPagination page={page.page} total={page.total} onPageChange={page.setPage} />
            </div>
          </>
        )}
      </DashboardPanel>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New financial product</DialogTitle>
            <DialogDescription>
              Start with a safe form for its workflow, then finish configuration in the product
              workspace.
            </DialogDescription>
          </DialogHeader>
          <form
            ref={createFormRef}
            className="space-y-4"
            onSubmit={(event) => void onCreate(event)}
            noValidate
          >
            <div className="grid gap-1.5">
              <Label htmlFor="new-product-label">
                Product name
                <RequiredIndicator />
              </Label>
              <Input
                id="new-product-label"
                value={newLabel}
                onChange={(event) => {
                  setNewLabel(event.target.value);
                  setCreateErrors((current) => {
                    const next = { ...current };
                    delete next.label;
                    return next;
                  });
                }}
                placeholder="Education Loan"
                maxLength={200}
                aria-invalid={Boolean(createErrors.label)}
                aria-describedby={createErrors.label ? "new-product-label-error" : undefined}
              />
              <FieldError id="new-product-label-error">{createErrors.label}</FieldError>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-product-category">Workflow</Label>
              <Select
                value={newCategory}
                onValueChange={(value: ProductCategory) => setNewCategory(value)}
              >
                <SelectTrigger id="new-product-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-product-order">
                Display order
                <RequiredIndicator />
              </Label>
              <Input
                id="new-product-order"
                type="number"
                min={0}
                max={10_000}
                value={newOrder}
                onChange={(event) => {
                  setNewOrder(event.target.value);
                  setCreateErrors((current) => {
                    const next = { ...current };
                    delete next.order;
                    return next;
                  });
                }}
                aria-invalid={Boolean(createErrors.order)}
                aria-describedby={createErrors.order ? "new-product-order-error" : undefined}
              />
              <FieldError id="new-product-order-error">{createErrors.order}</FieldError>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                Add product
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <FinancialProductWorkspace
        product={active}
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActive(null);
            void reloadOffers();
            void reload();
          }
        }}
        onSaved={(updated) => {
          setActive(updated);
          void reload();
          void reloadOffers();
        }}
      />
    </>
  );
}
