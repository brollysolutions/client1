"use client";

import * as React from "react";
import { Inbox, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createLoanType,
  updateLoanType,
  type AdminLoanType,
  type ProductCategory,
  type ProductFormDefinition,
} from "@/lib/loan-config-api";
import { FinancialProductFormBuilder } from "./financial-product-form-builder";
import { useLoanTypes } from "./use-loan-types";

const CATEGORY_LABEL: Record<ProductCategory, string> = {
  loan: "Loan or funding",
  credit_card: "Credit card",
  insurance: "Insurance",
};

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

function cloneForm(form: ProductFormDefinition): ProductFormDefinition {
  return JSON.parse(JSON.stringify(form)) as ProductFormDefinition;
}

export function LoanTypesView() {
  const { items, loading, error, reload } = useLoanTypes();
  const [active, setActive] = React.useState<AdminLoanType | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [newCategory, setNewCategory] = React.useState<ProductCategory>("loan");
  const [newOrder, setNewOrder] = React.useState("1000");
  const [draftLabel, setDraftLabel] = React.useState("");
  const [draftActive, setDraftActive] = React.useState(true);
  const [draftOrder, setDraftOrder] = React.useState("1000");
  const [draftForm, setDraftForm] = React.useState<ProductFormDefinition | null>(null);
  const [busy, setBusy] = React.useState(false);

  function openEdit(product: AdminLoanType) {
    setActive(product);
    setDraftLabel(product.label);
    setDraftActive(product.active);
    setDraftOrder(String(product.display_order));
    setDraftForm(cloneForm(product.form_schema));
  }

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    const order = Number(newOrder);
    if (newLabel.trim().length === 0) {
      toast.error("Product name can't be empty");
      return;
    }
    if (!Number.isInteger(order) || order < 0 || order > 10000) {
      toast.error("Display order must be between 0 and 10,000");
      return;
    }
    setBusy(true);
    const res = await createLoanType({
      label: newLabel.trim(),
      category: newCategory,
      display_order: order,
      form_schema: starterForm(newCategory),
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Financial product added");
      setNewLabel("");
      setNewCategory("loan");
      setNewOrder("1000");
      setCreating(false);
      void reload();
    } else {
      toast.error("Couldn't add financial product", { description: res.error });
    }
  }

  async function onSaveEdit() {
    if (!active || !draftForm) return;
    const order = Number(draftOrder);
    if (draftLabel.trim().length === 0) {
      toast.error("Product name can't be empty");
      return;
    }
    if (!Number.isInteger(order) || order < 0 || order > 10000) {
      toast.error("Display order must be between 0 and 10,000");
      return;
    }
    const labelChanged = draftLabel.trim() !== active.label;
    const activeChanged = draftActive !== active.active;
    const orderChanged = order !== active.display_order;
    const formChanged = JSON.stringify(draftForm) !== JSON.stringify(active.form_schema);
    if (!labelChanged && !activeChanged && !orderChanged && !formChanged) {
      setActive(null);
      return;
    }
    setBusy(true);
    const res = await updateLoanType(active.id, {
      label: labelChanged ? draftLabel.trim() : undefined,
      active: activeChanged ? draftActive : undefined,
      display_order: orderChanged ? order : undefined,
      form_schema: formChanged ? draftForm : undefined,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Financial product published", {
        description: formChanged
          ? `Clients will now see form version ${res.data.form_version}.`
          : undefined,
      });
      setActive(null);
      void reload();
    } else {
      toast.error("Couldn't update financial product", { description: res.error });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-text-secondary">
          One catalogue powers the Admin and Client dashboards. Published form changes are
          versioned; existing applications retain the form they used.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New product
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Inbox className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No financial products yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            Add the first product and configure the form clients will complete.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((product) => {
            const submissions = product.application_count + product.enquiry_count;
            return (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => openEdit(product)}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-cta/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-text-primary">{product.label}</p>
                      <span className="text-xs text-text-secondary">#{product.display_order}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-text-secondary">
                      {CATEGORY_LABEL[product.category]} · Form v{product.form_version} · {submissions === 0
                        ? "Not used yet"
                        : `${submissions} submission${submissions === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <Badge variant={product.active ? "secondary" : "outline"} className="shrink-0">
                    {product.active ? "Active" : "Disabled"}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New financial product</DialogTitle>
            <DialogDescription>
              It appears in the Client dashboard immediately. You can customize its starter form
              after creation.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void onCreate(event)}>
            <div className="grid gap-1.5">
              <Label htmlFor="new-product-label">Product name</Label>
              <Input
                id="new-product-label"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                placeholder="Education Loan"
                maxLength={200}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-product-category">Workflow</Label>
              <Select
                value={newCategory}
                onValueChange={(value: ProductCategory) => setNewCategory(value)}
              >
                <SelectTrigger id="new-product-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-product-order">Display order</Label>
              <Input
                id="new-product-order"
                type="number"
                min={0}
                max={10000}
                value={newOrder}
                onChange={(event) => setNewOrder(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Add product
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          {active && draftForm ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit {active.label}</DialogTitle>
                <DialogDescription>
                  Workflow: {CATEGORY_LABEL[active.category]}. Saving a form change publishes a new
                  version to the Client dashboard.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-product-label">Product name</Label>
                  <Input
                    id="edit-product-label"
                    value={draftLabel}
                    onChange={(event) => setDraftLabel(event.target.value)}
                    maxLength={200}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-product-order">Display order</Label>
                  <Input
                    id="edit-product-order"
                    type="number"
                    min={0}
                    max={10000}
                    value={draftOrder}
                    onChange={(event) => setDraftOrder(event.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Checkbox
                    id="edit-product-active"
                    checked={draftActive}
                    onCheckedChange={(checked) => setDraftActive(checked === true)}
                  />
                  <Label htmlFor="edit-product-active" className="font-normal">
                    Active and visible to clients
                  </Label>
                </div>
              </div>

              <div className="border-t border-border pt-5">
                <h3 className="font-heading text-lg font-semibold text-text-primary">
                  Client application form
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Use professional labels and keep the questions in the order a client should
                  answer them.
                </p>
                <div className="mt-4">
                  <FinancialProductFormBuilder
                    category={active.category}
                    value={draftForm}
                    onChange={setDraftForm}
                    disabled={busy}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActive(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={() => void onSaveEdit()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Publish changes
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
