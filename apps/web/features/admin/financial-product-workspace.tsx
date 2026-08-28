"use client";

import * as React from "react";
import { FileText, Landmark, Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WORKSPACE_DIALOG_CLASS,
  WorkspaceDialogHeader,
} from "@/features/dashboard/workspace-dialog";
import {
  updateLoanType,
  type AdminLoanType,
  type ProductFormDefinition,
} from "@/lib/loan-config-api";
import { formatLastUpdated } from "@/lib/format";
import { focusFirstInvalidField, integerError, requiredTextError } from "@/lib/form-validation";
import {
  validateProductFormDefinition,
  type ProductFormDefinitionErrors,
} from "@/lib/financial-product-form-definition";
import { FinancialProductFormBuilder } from "./financial-product-form-builder";
import { ProviderOffersView } from "./provider-offers-view";

const CATEGORY_LABEL = {
  loan: "Loan or funding",
  credit_card: "Credit card",
  insurance: "Insurance",
} as const;

function cloneForm(form: ProductFormDefinition): ProductFormDefinition {
  return JSON.parse(JSON.stringify(form)) as ProductFormDefinition;
}

export function FinancialProductWorkspace({
  product,
  open,
  onOpenChange,
  onSaved,
}: {
  product: AdminLoanType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (product: AdminLoanType) => void;
}) {
  const [tab, setTab] = React.useState("details");
  const [draftLabel, setDraftLabel] = React.useState("");
  const [draftActive, setDraftActive] = React.useState(true);
  const [draftPublicVisible, setDraftPublicVisible] = React.useState(false);
  const [draftOrder, setDraftOrder] = React.useState("1000");
  const [draftFeatured, setDraftFeatured] = React.useState(false);
  const [draftFeaturedOrder, setDraftFeaturedOrder] = React.useState("1000");
  const [draftForm, setDraftForm] = React.useState<ProductFormDefinition | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [builderErrors, setBuilderErrors] = React.useState<ProductFormDefinitionErrors>({});
  const [busy, setBusy] = React.useState(false);
  const workspaceRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!product) return;
    setTab("details");
    setDraftLabel(product.label);
    setDraftActive(product.active);
    setDraftPublicVisible(product.public_visible);
    setDraftOrder(String(product.display_order));
    setDraftFeatured(product.homepage_featured);
    setDraftFeaturedOrder(String(product.homepage_feature_order));
    setDraftForm(cloneForm(product.form_schema));
    setFieldErrors({});
    setBuilderErrors({});
  }, [product]);

  function clearError(key: string) {
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function save() {
    if (!product || !draftForm) return;
    const order = Number(draftOrder);
    const featuredOrder = Number(draftFeaturedOrder);
    const next: Record<string, string> = {};
    const labelError = requiredTextError(draftLabel, "Product name", 200);
    const orderError = integerError(draftOrder, "Display order", {
      required: true,
      min: 0,
      max: 10_000,
    });
    const featuredOrderError = integerError(draftFeaturedOrder, "Homepage order", {
      required: true,
      min: 0,
      max: 10_000,
    });
    if (labelError) next.label = labelError;
    if (orderError) next.order = orderError;
    if (featuredOrderError) next.featuredOrder = featuredOrderError;
    if (draftFeatured && !draftPublicVisible) {
      next.featured = "Publish the product before featuring it on Home.";
    }
    if (
      draftPublicVisible &&
      (!product.public_summary?.trim() || !product.public_description?.trim())
    ) {
      next.publicVisible =
        "This product has no frozen summary or description, so it cannot be published yet.";
    }
    const nextBuilderErrors = validateProductFormDefinition(product.category, draftForm);
    setFieldErrors(next);
    setBuilderErrors(nextBuilderErrors);
    if (Object.keys(next).length > 0 || Object.keys(nextBuilderErrors).length > 0) {
      // Inactive tab panels are unmounted, so reveal the tab that owns the first
      // error before focusing — otherwise a save can fail with nothing on screen.
      const errorTab = Object.keys(next).length > 0 ? "details" : "form";
      setTab(errorTab);
      requestAnimationFrame(() => {
        if (workspaceRef.current) focusFirstInvalidField(workspaceRef.current);
      });
      return;
    }

    const formChanged = JSON.stringify(draftForm) !== JSON.stringify(product.form_schema);
    const payload = {
      ...(draftLabel.trim() !== product.label ? { label: draftLabel.trim() } : {}),
      ...(draftActive !== product.active ? { active: draftActive } : {}),
      ...(draftPublicVisible !== product.public_visible
        ? { public_visible: draftPublicVisible }
        : {}),
      ...(order !== product.display_order ? { display_order: order } : {}),
      ...(draftFeatured !== product.homepage_featured
        ? { homepage_featured: draftFeatured }
        : {}),
      ...(featuredOrder !== product.homepage_feature_order
        ? { homepage_feature_order: featuredOrder }
        : {}),
      ...(formChanged ? { form_schema: draftForm } : {}),
    };
    if (Object.keys(payload).length === 0) {
      toast.message("No changes to save");
      return;
    }

    setBusy(true);
    const response = await updateLoanType(product.id, payload);
    setBusy(false);
    if (!response.ok) {
      toast.error("Couldn't update financial product", { description: response.error });
      return;
    }
    toast.success("Financial product updated", {
      description: formChanged
        ? `Clients will now use form version ${response.data.form_version}.`
        : undefined,
    });
    onSaved(response.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={workspaceRef}
        className={WORKSPACE_DIALOG_CLASS}
        showCloseButton={false}
      >
        {product && draftForm ? (
          <>
            <WorkspaceDialogHeader
              title={product.label}
              description={`${CATEGORY_LABEL[product.category]} · Form v${product.form_version} · ${formatLastUpdated(product.updated_at)}`}
              actions={tab !== "providers" ? (
                <Button size="sm" onClick={() => void save()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  Save product
                </Button>
              ) : undefined}
              closeLabel="Close financial product workspace"
            />

            <Tabs
              value={tab}
              onValueChange={setTab}
              className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] pt-4"
            >
              <TabsList className="h-auto w-full justify-start overflow-x-auto">
                <TabsTrigger value="details">
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  Details
                </TabsTrigger>
                <TabsTrigger value="form">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Application form
                </TabsTrigger>
                <TabsTrigger value="providers">
                  <Landmark className="h-4 w-4" aria-hidden="true" />
                  Providers
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-4 min-h-0 overflow-y-auto pr-1">
                <div className="mx-auto max-w-6xl space-y-5 pb-6">
                  <section className="rounded-xl border border-border bg-card p-5">
                    <h2 className="font-semibold text-text-primary">Catalogue controls</h2>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                      These drive the product name everywhere it appears, its place in the
                      Financial Services catalogue, and whether clients can apply for it.
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className="grid gap-1.5 md:col-span-2 xl:col-span-1">
                        <Label htmlFor="product-workspace-label">
                          Product name
                          <RequiredIndicator />
                        </Label>
                        <Input
                          id="product-workspace-label"
                          value={draftLabel}
                          maxLength={200}
                          onChange={(event) => {
                            setDraftLabel(event.target.value);
                            clearError("label");
                          }}
                          aria-invalid={Boolean(fieldErrors.label)}
                          aria-describedby={fieldErrors.label ? "product-workspace-label-error" : undefined}
                        />
                        <FieldError id="product-workspace-label-error">{fieldErrors.label}</FieldError>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="product-workspace-order">
                          Display order
                          <RequiredIndicator />
                        </Label>
                        <Input
                          id="product-workspace-order"
                          type="number"
                          min={0}
                          max={10_000}
                          value={draftOrder}
                          onChange={(event) => {
                            setDraftOrder(event.target.value);
                            clearError("order");
                          }}
                          aria-invalid={Boolean(fieldErrors.order)}
                          aria-describedby={fieldErrors.order ? "product-workspace-order-error" : undefined}
                        />
                        <FieldError id="product-workspace-order-error">{fieldErrors.order}</FieldError>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="product-workspace-feature-order">Homepage order</Label>
                        <Input
                          id="product-workspace-feature-order"
                          type="number"
                          min={0}
                          max={10_000}
                          value={draftFeaturedOrder}
                          onChange={(event) => {
                            setDraftFeaturedOrder(event.target.value);
                            clearError("featuredOrder");
                          }}
                          aria-invalid={Boolean(fieldErrors.featuredOrder)}
                          aria-describedby={
                            fieldErrors.featuredOrder
                              ? "product-workspace-feature-order-error"
                              : undefined
                          }
                        />
                        <FieldError id="product-workspace-feature-order-error">
                          {fieldErrors.featuredOrder}
                        </FieldError>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="product-workspace-active"
                          checked={draftActive}
                          onCheckedChange={(checked) => setDraftActive(checked === true)}
                        />
                        <Label htmlFor="product-workspace-active" className="font-normal">
                          Active for new client submissions
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="product-workspace-public"
                          checked={draftPublicVisible}
                          onCheckedChange={(checked) => {
                            const visible = checked === true;
                            setDraftPublicVisible(visible);
                            if (!visible) setDraftFeatured(false);
                            clearError("publicVisible");
                          }}
                          aria-invalid={Boolean(fieldErrors.publicVisible)}
                          aria-describedby={
                            fieldErrors.publicVisible ? "product-workspace-public-error" : undefined
                          }
                        />
                        <Label htmlFor="product-workspace-public" className="font-normal">
                          Visible on Financial Services
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="product-workspace-featured"
                          checked={draftFeatured}
                          onCheckedChange={(checked) => {
                            setDraftFeatured(checked === true);
                            clearError("featured");
                          }}
                          aria-invalid={Boolean(fieldErrors.featured)}
                          aria-describedby={
                            fieldErrors.featured ? "product-workspace-featured-error" : undefined
                          }
                        />
                        <Label htmlFor="product-workspace-featured" className="font-normal">
                          Mark as homepage featured
                        </Label>
                      </div>
                    </div>
                    <FieldError id="product-workspace-public-error" className="mt-2">
                      {fieldErrors.publicVisible}
                    </FieldError>
                    <FieldError id="product-workspace-featured-error" className="mt-2">
                      {fieldErrors.featured}
                    </FieldError>
                  </section>
                </div>
              </TabsContent>

              <TabsContent value="form" className="mt-4 min-h-0 overflow-y-auto pr-1">
                <div className="mx-auto max-w-6xl space-y-5 pb-6">
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <h2 className="font-semibold text-text-primary">Application form</h2>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                      Form changes are versioned. Existing submissions keep the exact schema they
                      used, while new clients receive the next version.
                    </p>
                  </div>
                  <FinancialProductFormBuilder
                    category={product.category}
                    value={draftForm}
                    onChange={(next) => {
                      setDraftForm(next);
                      setBuilderErrors({});
                    }}
                    disabled={busy}
                    errors={builderErrors}
                  />
                </div>
              </TabsContent>

              <TabsContent value="providers" className="mt-4 min-h-0 overflow-y-auto pr-1">
                <ProviderOffersView product={product} />
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
