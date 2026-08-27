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
import { ListPagination, useListPagination } from "@/features/dashboard/list-pagination";
import { Textarea } from "@/components/ui/textarea";
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
import { formatLastUpdated } from "@/lib/format";
import { focusFirstInvalidField, integerError, requiredTextError } from "@/lib/form-validation";
import {
  validateProductFormDefinition,
  type ProductFormDefinitionErrors,
} from "@/lib/financial-product-form-definition";
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

function textLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function faqLines(value: string): Array<{ question: string; answer: string }> {
  return textLines(value).flatMap((line) => {
    const separator = line.indexOf("|");
    if (separator < 1) return [];
    const question = line.slice(0, separator).trim();
    const answer = line.slice(separator + 1).trim();
    return question && answer ? [{ question, answer }] : [];
  });
}

function publicListError(value: string, label: string): string | undefined {
  const items = textLines(value);
  if (items.length > 12) return `${label} may contain at most 12 items.`;
  if (items.some((item) => item.length < 2 || item.length > 180)) {
    return `Each ${label.toLowerCase()} item must be between 2 and 180 characters.`;
  }
  if (new Set(items.map((item) => item.toLocaleLowerCase("en-IN"))).size !== items.length) {
    return `${label} items must be unique.`;
  }
  return undefined;
}

export function LoanTypesView() {
  const { items, loading, error, reload } = useLoanTypes();
  const { page, pageItems, setPage } = useListPagination(items);
  const [active, setActive] = React.useState<AdminLoanType | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [newCategory, setNewCategory] = React.useState<ProductCategory>("loan");
  const [newOrder, setNewOrder] = React.useState("1000");
  const [draftLabel, setDraftLabel] = React.useState("");
  const [draftActive, setDraftActive] = React.useState(true);
  const [draftOrder, setDraftOrder] = React.useState("1000");
  const [draftForm, setDraftForm] = React.useState<ProductFormDefinition | null>(null);
  const [draftPublicVisible, setDraftPublicVisible] = React.useState(false);
  const [draftSummary, setDraftSummary] = React.useState("");
  const [draftDescription, setDraftDescription] = React.useState("");
  const [draftHighlights, setDraftHighlights] = React.useState("");
  const [draftEligibility, setDraftEligibility] = React.useState("");
  const [draftDocuments, setDraftDocuments] = React.useState("");
  const [draftFaq, setDraftFaq] = React.useState("");
  const [draftFeatured, setDraftFeatured] = React.useState(false);
  const [draftFeaturedOrder, setDraftFeaturedOrder] = React.useState("1000");
  const [busy, setBusy] = React.useState(false);
  const [createErrors, setCreateErrors] = React.useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = React.useState<Record<string, string>>({});
  const [builderErrors, setBuilderErrors] = React.useState<ProductFormDefinitionErrors>({});
  const createFormRef = React.useRef<HTMLFormElement>(null);
  const editDialogRef = React.useRef<HTMLDivElement>(null);

  function openEdit(product: AdminLoanType) {
    setActive(product);
    setDraftLabel(product.label);
    setDraftActive(product.active);
    setDraftOrder(String(product.display_order));
    setDraftForm(cloneForm(product.form_schema));
    setDraftPublicVisible(product.public_visible);
    setDraftSummary(product.public_summary ?? "");
    setDraftDescription(product.public_description ?? "");
    setDraftHighlights(product.public_highlights.join("\n"));
    setDraftEligibility(product.public_eligibility.join("\n"));
    setDraftDocuments(product.public_documents.join("\n"));
    setDraftFaq(product.public_faq.map((item) => `${item.question} | ${item.answer}`).join("\n"));
    setDraftFeatured(product.homepage_featured);
    setDraftFeaturedOrder(String(product.homepage_feature_order));
    setEditErrors({});
    setBuilderErrors({});
  }

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    const order = Number(newOrder);
    const next: Record<string, string> = {};
    const labelError = requiredTextError(newLabel, "Product name", 200);
    const orderError = integerError(newOrder, "Display order", { required: true, min: 0, max: 10_000 });
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
    const next: Record<string, string> = {};
    const labelError = requiredTextError(draftLabel, "Product name", 200);
    const orderError = integerError(draftOrder, "Display order", { required: true, min: 0, max: 10_000 });
    if (labelError) next.label = labelError;
    if (orderError) next.order = orderError;
    const labelChanged = draftLabel.trim() !== active.label;
    const activeChanged = draftActive !== active.active;
    const orderChanged = order !== active.display_order;
    const formChanged = JSON.stringify(draftForm) !== JSON.stringify(active.form_schema);
    const featuredOrder = Number(draftFeaturedOrder);
    const featuredOrderError = integerError(draftFeaturedOrder, "Homepage order", { required: true, min: 0, max: 10_000 });
    if (featuredOrderError) next.featuredOrder = featuredOrderError;
    if (draftPublicVisible && (!draftSummary.trim() || !draftDescription.trim())) {
      if (!draftSummary.trim()) next.summary = "Card summary is required for public products.";
      if (!draftDescription.trim()) next.description = "Page description is required for public products.";
    }
    if (draftFeatured && !draftPublicVisible) {
      next.featured = "Publish the product before featuring it on Home.";
    }
    const faqSourceLines = textLines(draftFaq);
    const parsedFaq = faqLines(draftFaq);
    if (parsedFaq.length !== faqSourceLines.length) {
      next.faq = "Format every FAQ as Question | Answer.";
    } else if (parsedFaq.length > 10) {
      next.faq = "Add at most 10 FAQs.";
    } else if (
      parsedFaq.some(
        (item) =>
          item.question.length < 3 ||
          item.question.length > 180 ||
          item.answer.length < 3 ||
          item.answer.length > 800,
      )
    ) {
      next.faq = "FAQ questions must be 3-180 characters and answers 3-800 characters.";
    }
    const highlightsError = publicListError(draftHighlights, "Highlights");
    const eligibilityError = publicListError(draftEligibility, "Eligibility");
    const documentsError = publicListError(draftDocuments, "Documents");
    if (highlightsError) next.highlights = highlightsError;
    if (eligibilityError) next.eligibility = eligibilityError;
    if (documentsError) next.documents = documentsError;
    const nextBuilderErrors = validateProductFormDefinition(active.category, draftForm);
    setEditErrors(next);
    setBuilderErrors(nextBuilderErrors);
    if (Object.keys(next).length > 0 || Object.keys(nextBuilderErrors).length > 0) {
      requestAnimationFrame(() => {
        if (editDialogRef.current) focusFirstInvalidField(editDialogRef.current);
      });
      return;
    }
    const marketing = {
      public_visible: draftPublicVisible,
      public_summary: draftSummary.trim() || null,
      public_description: draftDescription.trim() || null,
      public_highlights: textLines(draftHighlights),
      public_eligibility: textLines(draftEligibility),
      public_documents: textLines(draftDocuments),
      public_faq: parsedFaq,
      homepage_featured: draftFeatured,
      homepage_feature_order: featuredOrder,
    };
    const marketingChanged = JSON.stringify(marketing) !== JSON.stringify({
      public_visible: active.public_visible,
      public_summary: active.public_summary,
      public_description: active.public_description,
      public_highlights: active.public_highlights,
      public_eligibility: active.public_eligibility,
      public_documents: active.public_documents,
      public_faq: active.public_faq,
      homepage_featured: active.homepage_featured,
      homepage_feature_order: active.homepage_feature_order,
    });
    if (!labelChanged && !activeChanged && !orderChanged && !formChanged && !marketingChanged) {
      setActive(null);
      return;
    }
    setBusy(true);
    const res = await updateLoanType(active.id, {
      label: labelChanged ? draftLabel.trim() : undefined,
      active: activeChanged ? draftActive : undefined,
      display_order: orderChanged ? order : undefined,
      form_schema: formChanged ? draftForm : undefined,
      ...(marketingChanged ? marketing : {}),
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
        <div className="space-y-3">
        <ul className="space-y-3">
          {pageItems.map((product) => {
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
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {formatLastUpdated(product.updated_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={product.active ? "secondary" : "outline"}>
                      {product.active ? "Active" : "Disabled"}
                    </Badge>
                    <Badge variant={product.public_visible ? "default" : "outline"}>
                      {product.public_visible ? "Public" : "Dashboard only"}
                    </Badge>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <ListPagination page={page} total={items.length} onPageChange={setPage} label="Financial products pages" />
        </div>
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
          <form ref={createFormRef} className="space-y-4" onSubmit={(event) => void onCreate(event)} noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="new-product-label">Product name<RequiredIndicator /></Label>
              <Input
                id="new-product-label"
                value={newLabel}
                onChange={(event) => { setNewLabel(event.target.value); setCreateErrors((current) => { const next = { ...current }; delete next.label; return next; }); }}
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
                <SelectTrigger id="new-product-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-product-order">Display order<RequiredIndicator /></Label>
              <Input
                id="new-product-order"
                type="number"
                min={0}
                max={10000}
                value={newOrder}
                onChange={(event) => { setNewOrder(event.target.value); setCreateErrors((current) => { const next = { ...current }; delete next.order; return next; }); }}
                aria-invalid={Boolean(createErrors.order)}
                aria-describedby={createErrors.order ? "new-product-order-error" : undefined}
              />
              <FieldError id="new-product-order-error">{createErrors.order}</FieldError>
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
        <DialogContent ref={editDialogRef} className="max-h-[92vh] max-w-5xl overflow-y-auto">
          {active && draftForm ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit {active.label}</DialogTitle>
                <DialogDescription>
                  Workflow: {CATEGORY_LABEL[active.category]}. Saving a form change publishes a new
                  version to the Client dashboard.
                  <span className="mt-1 block">{formatLastUpdated(active.updated_at)}</span>
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-product-label">Product name<RequiredIndicator /></Label>
                  <Input
                    id="edit-product-label"
                    value={draftLabel}
                    onChange={(event) => { setDraftLabel(event.target.value); setEditErrors((current) => { const next = { ...current }; delete next.label; return next; }); }}
                    maxLength={200}
                    aria-invalid={Boolean(editErrors.label)}
                    aria-describedby={editErrors.label ? "edit-product-label-error" : undefined}
                  />
                  <FieldError id="edit-product-label-error">{editErrors.label}</FieldError>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-product-order">Display order<RequiredIndicator /></Label>
                  <Input
                    id="edit-product-order"
                    type="number"
                    min={0}
                    max={10000}
                    value={draftOrder}
                    onChange={(event) => { setDraftOrder(event.target.value); setEditErrors((current) => { const next = { ...current }; delete next.order; return next; }); }}
                    aria-invalid={Boolean(editErrors.order)}
                    aria-describedby={editErrors.order ? "edit-product-order-error" : undefined}
                  />
                  <FieldError id="edit-product-order-error">{editErrors.order}</FieldError>
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
                  Public service page
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Publishing creates the catalogue card and internal detail page. Use one item per
                  line for highlights, eligibility, and documents.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Checkbox
                      id="edit-product-public"
                      checked={draftPublicVisible}
                      onCheckedChange={(checked) => {
                        const visible = checked === true;
                        setDraftPublicVisible(visible);
                        if (!visible) setDraftFeatured(false);
                      }}
                    />
                    <Label htmlFor="edit-product-public" className="font-normal">
                      Publish on Financial Services and create its detail page
                    </Label>
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="edit-product-summary">Card summary</Label>
                    <Input id="edit-product-summary" value={draftSummary} onChange={(event) => { setDraftSummary(event.target.value); setEditErrors((current) => { const next = { ...current }; delete next.summary; return next; }); }} maxLength={280} aria-invalid={Boolean(editErrors.summary)} aria-describedby={editErrors.summary ? "edit-product-summary-error" : undefined} />
                    <FieldError id="edit-product-summary-error">{editErrors.summary}</FieldError>
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="edit-product-description">Page description</Label>
                    <Textarea id="edit-product-description" value={draftDescription} onChange={(event) => { setDraftDescription(event.target.value); setEditErrors((current) => { const next = { ...current }; delete next.description; return next; }); }} maxLength={4000} rows={4} aria-invalid={Boolean(editErrors.description)} aria-describedby={editErrors.description ? "edit-product-description-error" : undefined} />
                    <FieldError id="edit-product-description-error">{editErrors.description}</FieldError>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="edit-product-highlights">Highlights</Label>
                    <Textarea id="edit-product-highlights" value={draftHighlights} onChange={(event) => { setDraftHighlights(event.target.value); setEditErrors((current) => { const next = { ...current }; delete next.highlights; return next; }); }} rows={5} maxLength={5000} aria-invalid={Boolean(editErrors.highlights)} aria-describedby={editErrors.highlights ? "edit-product-highlights-error" : undefined} />
                    <FieldError id="edit-product-highlights-error">{editErrors.highlights}</FieldError>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="edit-product-eligibility">General eligibility</Label>
                    <Textarea id="edit-product-eligibility" value={draftEligibility} onChange={(event) => { setDraftEligibility(event.target.value); setEditErrors((current) => { const next = { ...current }; delete next.eligibility; return next; }); }} rows={5} maxLength={5000} aria-invalid={Boolean(editErrors.eligibility)} aria-describedby={editErrors.eligibility ? "edit-product-eligibility-error" : undefined} />
                    <FieldError id="edit-product-eligibility-error">{editErrors.eligibility}</FieldError>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="edit-product-documents">Documents to prepare</Label>
                    <Textarea id="edit-product-documents" value={draftDocuments} onChange={(event) => { setDraftDocuments(event.target.value); setEditErrors((current) => { const next = { ...current }; delete next.documents; return next; }); }} rows={5} maxLength={5000} aria-invalid={Boolean(editErrors.documents)} aria-describedby={editErrors.documents ? "edit-product-documents-error" : undefined} />
                    <FieldError id="edit-product-documents-error">{editErrors.documents}</FieldError>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="edit-product-faq">FAQs (Question | Answer)</Label>
                    <Textarea id="edit-product-faq" value={draftFaq} onChange={(event) => { setDraftFaq(event.target.value); setEditErrors((current) => { const next = { ...current }; delete next.faq; return next; }); }} rows={5} maxLength={10000} aria-invalid={Boolean(editErrors.faq)} aria-describedby={editErrors.faq ? "edit-product-faq-error" : undefined} />
                    <FieldError id="edit-product-faq-error">{editErrors.faq}</FieldError>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="edit-product-featured" checked={draftFeatured} onCheckedChange={(checked) => { setDraftFeatured(checked === true); setEditErrors((current) => { const next = { ...current }; delete next.featured; return next; }); }} aria-invalid={Boolean(editErrors.featured)} aria-describedby={editErrors.featured ? "edit-product-featured-error" : undefined} />
                    <Label htmlFor="edit-product-featured" className="font-normal">Feature on Home</Label>
                    <FieldError id="edit-product-featured-error">{editErrors.featured}</FieldError>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="edit-product-feature-order">Homepage order</Label>
                    <Input id="edit-product-feature-order" type="number" min={0} max={10000} value={draftFeaturedOrder} onChange={(event) => { setDraftFeaturedOrder(event.target.value); setEditErrors((current) => { const next = { ...current }; delete next.featuredOrder; return next; }); }} aria-invalid={Boolean(editErrors.featuredOrder)} aria-describedby={editErrors.featuredOrder ? "edit-product-feature-order-error" : undefined} />
                    <FieldError id="edit-product-feature-order-error">{editErrors.featuredOrder}</FieldError>
                  </div>
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
                    onChange={(next) => { setDraftForm(next); setBuilderErrors({}); }}
                    disabled={busy}
                    errors={builderErrors}
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
