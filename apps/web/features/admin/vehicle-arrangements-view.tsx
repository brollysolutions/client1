"use client";

import * as React from "react";
import { CarFront } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { DashboardHeader, DashboardPage, DashboardPanel } from "@/features/dashboard/dashboard-ui";
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
  filtersAreActive,
  matchesSearch,
  type FilterBarValue,
} from "@/features/dashboard/filter-bar";
import { ListEmptyState, ListLoadingState, ListPagination } from "@/features/dashboard/list-states";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import type { VehicleArrangement, VehicleArrangementStatus } from "@/lib/admin-api";
import { isInDateRange } from "@/lib/date-range";
import {
  e164PhoneError,
  focusFirstInvalidField,
  requiredTextError,
  type FieldErrors,
} from "@/lib/form-validation";
import { formatMobile } from "@/lib/phone";

import { useAdminVehicleArrangements } from "./use-admin-vehicle-arrangements";

const STATUS_LABEL: Record<VehicleArrangementStatus, string> = {
  requested: "Requested",
  arranged: "Arranged",
  assigned: "Assigned",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<VehicleArrangementStatus, StatusTone> = {
  requested: "warning",
  arranged: "info",
  assigned: "info",
  completed: "success",
  cancelled: "danger",
};

const STATUS_OPTIONS = (Object.entries(STATUS_LABEL) as [VehicleArrangementStatus, string][]).map(
  ([value, label]) => ({ value, label }),
);

const CLOSED_STATUSES: readonly string[] = ["completed", "cancelled"];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className="text-right text-sm font-medium text-text-primary">{value}</dd>
    </div>
  );
}

export function AdminVehicleArrangementsView() {
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ key: "pickup_at", dir: "asc" });
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const { items, loading, error, reload, updateArrangement } = useAdminVehicleArrangements(
    filters.status === "all" ? undefined : (filters.status as VehicleArrangementStatus),
  );

  const [vehicle, setVehicle] = React.useState("");
  const [registration, setRegistration] = React.useState("");
  const [driver, setDriver] = React.useState("");
  const [driverMobile, setDriverMobile] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<
    FieldErrors<"vehicle" | "registration" | "driver" | "driverMobile">
  >({});
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const rows = items.filter(
      (item) =>
        isInDateRange(item.pickup_at, filters.from, filters.to) &&
        matchesSearch(
          `${item.property_title} ${item.property_city} ${item.assigned_employee_name ?? ""}`,
          filters.search,
        ),
    );
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "property_title":
          return a.property_title.localeCompare(b.property_title) * direction;
        case "status":
          return a.status.localeCompare(b.status) * direction;
        default:
          return (new Date(a.pickup_at).getTime() - new Date(b.pickup_at).getTime()) * direction;
      }
    });
  }, [filters, items, sort]);

  const { page, setPage, pageRows, total } = useFilteredPage(filtered, filters);
  const active = activeId ? items.find((item) => item.id === activeId) ?? null : null;

  // Seed the transport form from whichever arrangement is open, so reopening a
  // partially-filled record does not present an empty form.
  React.useEffect(() => {
    if (!active) return;
    setVehicle(active.vehicle_make_model ?? "");
    setRegistration(active.vehicle_registration ?? "");
    setDriver(active.driver_name ?? "");
    setDriverMobile(active.driver_mobile ?? "");
    setFieldErrors({});
  }, [active]);

  async function arrange() {
    if (!active) return;
    const errors = {
      vehicle: requiredTextError(vehicle, "Vehicle make and model", 160),
      registration: requiredTextError(registration, "Registration number", 40),
      driver: requiredTextError(driver, "Driver name", 120),
      driverMobile: e164PhoneError(driverMobile, { required: true }),
    };
    const nextErrors = Object.fromEntries(
      Object.entries(errors).filter(([, message]) => message),
    ) as typeof fieldErrors;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      requestAnimationFrame(() => {
        if (dialogRef.current) focusFirstInvalidField(dialogRef.current);
      });
      return;
    }
    setBusyId(active.id);
    const result = await updateArrangement(active.id, {
      status: "arranged",
      vehicle_make_model: vehicle.trim(),
      vehicle_registration: registration.trim(),
      driver_name: driver.trim(),
      driver_mobile: driverMobile.trim(),
    });
    setBusyId(null);
    if (!result.ok) {
      toast.error("Could not arrange vehicle", { description: result.error });
      return;
    }
    setActiveId(null);
    toast.success("Vehicle arranged");
  }

  async function cancel(item: VehicleArrangement) {
    setBusyId(item.id);
    const result = await updateArrangement(item.id, { status: "cancelled" });
    setBusyId(null);
    if (!result.ok) {
      toast.error("Could not update arrangement", { description: result.error });
      return;
    }
    setActiveId(null);
    toast.success("Pickup cancelled");
  }

  const columns: DataColumn<VehicleArrangement>[] = [
    {
      key: "property_title",
      header: "Property",
      sortable: true,
      cellClassName: "max-w-[20rem]",
      render: (item) => (
        <DataTablePrimaryCell
          title={item.property_title}
          subtitle={[item.property_locality, item.property_city].filter(Boolean).join(", ")}
        />
      ),
    },
    {
      key: "pickup_at",
      header: "Pickup",
      sortable: true,
      render: (item) => (
        <div className="min-w-0">
          <p className="text-text-primary">{formatDateTime(item.pickup_at)}</p>
          <p className="truncate text-xs text-text-secondary">{item.pickup_location}</p>
        </div>
      ),
    },
    {
      key: "vehicle",
      header: "Vehicle",
      render: (item) =>
        item.vehicle_make_model ? (
          <div className="min-w-0">
            <p className="truncate text-text-primary">{item.vehicle_make_model}</p>
            <p className="truncate text-xs text-text-secondary">{item.vehicle_registration}</p>
          </div>
        ) : (
          <span className="text-text-secondary">Not entered</span>
        ),
    },
    {
      key: "assigned_employee_name",
      header: "Assigned to",
      render: (item) => (
        <span className="text-text-secondary">{item.assigned_employee_name ?? "Unassigned"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (item) => (
        <StatusBadge tone={STATUS_TONE[item.status] ?? "neutral"}>
          {STATUS_LABEL[item.status] ?? item.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <DashboardPage>
      <DashboardHeader
        title="Vehicle arrangements"
        description="Confirm transport details; the platform assigns an eligible Employee automatically."
      />

      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search vehicle arrangements"
        searchPlaceholder="Property, city, or Employee"
        statusOptions={STATUS_OPTIONS}
        showLine={false}
        dateFromLabel="Pickup from"
        dateToLabel="Pickup to"
      />

      {loading ? (
        <ListLoadingState />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : total === 0 ? (
        <ListEmptyState
          icon={CarFront}
          title={
            filtersAreActive(filters)
              ? "No arrangements match these filters"
              : "No vehicle arrangements"
          }
          description={
            filtersAreActive(filters)
              ? "Try a different search, status, or pickup date range."
              : "Site visits that request transport will appear here."
          }
        />
      ) : (
        <DashboardPanel
          title="Arrangements"
          description={
            filtersAreActive(filters)
              ? `${total} of ${items.length} arrangements`
              : `${items.length} arrangements`
          }
          bodyClassName="p-0"
        >
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(item) => item.id}
            sort={sort}
            onSortChange={(key) => setSort((current) => nextSort(current, key))}
            onRowClick={(item) => setActiveId(item.id)}
            rowActionLabel="Open arrangement"
            minWidth="min-w-[900px]"
          />
          <div className="px-5 pb-4">
            <ListPagination page={page} total={total} onPageChange={setPage} />
          </div>
        </DashboardPanel>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActiveId(null)}>
        <DialogContent ref={dialogRef} className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{active.property_title}</DialogTitle>
                <DialogDescription>
                  {[active.property_locality, active.property_city].filter(Boolean).join(", ")}
                </DialogDescription>
              </DialogHeader>

              <dl className="divide-y divide-border rounded-xl border border-border px-4">
                <DetailRow
                  label="Status"
                  value={
                    <StatusBadge tone={STATUS_TONE[active.status] ?? "neutral"}>
                      {STATUS_LABEL[active.status] ?? active.status}
                    </StatusBadge>
                  }
                />
                <DetailRow label="Pickup at" value={formatDateTime(active.pickup_at)} />
                <DetailRow label="Pickup location" value={active.pickup_location} />
                <DetailRow label="Assigned to" value={active.assigned_employee_name ?? "Unassigned"} />
                {active.driver_mobile ? (
                  <DetailRow label="Driver" value={`${active.driver_name} · ${formatMobile(active.driver_mobile)}`} />
                ) : null}
                {active.completed_at ? (
                  <DetailRow label="Completed" value={formatDateTime(active.completed_at)} />
                ) : null}
                {active.cancelled_at ? (
                  <DetailRow label="Cancelled" value={formatDateTime(active.cancelled_at)} />
                ) : null}
                {active.cancellation_reason ? (
                  <DetailRow label="Cancellation reason" value={active.cancellation_reason} />
                ) : null}
              </dl>

              {active.status === "requested" ? (
                <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">Transport details</h3>
                    <p className="mt-0.5 text-xs leading-5 text-text-secondary">
                      Entering these marks the pickup arranged and hands it to an eligible Employee.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="vehicle-model">
                        Vehicle make and model <RequiredIndicator />
                      </Label>
                      <Input
                        id="vehicle-model"
                        value={vehicle}
                        maxLength={160}
                        onChange={(event) => {
                          setVehicle(event.target.value);
                          setFieldErrors((current) => ({ ...current, vehicle: undefined }));
                        }}
                        aria-invalid={Boolean(fieldErrors.vehicle)}
                        aria-describedby={fieldErrors.vehicle ? "vehicle-model-error" : undefined}
                      />
                      <FieldError id="vehicle-model-error">{fieldErrors.vehicle}</FieldError>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="vehicle-registration">
                        Registration number <RequiredIndicator />
                      </Label>
                      <Input
                        id="vehicle-registration"
                        value={registration}
                        maxLength={40}
                        onChange={(event) => {
                          setRegistration(event.target.value);
                          setFieldErrors((current) => ({ ...current, registration: undefined }));
                        }}
                        aria-invalid={Boolean(fieldErrors.registration)}
                        aria-describedby={
                          fieldErrors.registration ? "vehicle-registration-error" : undefined
                        }
                      />
                      <FieldError id="vehicle-registration-error">
                        {fieldErrors.registration}
                      </FieldError>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="driver-name">
                        Driver name <RequiredIndicator />
                      </Label>
                      <Input
                        id="driver-name"
                        value={driver}
                        maxLength={120}
                        onChange={(event) => {
                          setDriver(event.target.value);
                          setFieldErrors((current) => ({ ...current, driver: undefined }));
                        }}
                        aria-invalid={Boolean(fieldErrors.driver)}
                        aria-describedby={fieldErrors.driver ? "driver-name-error" : undefined}
                      />
                      <FieldError id="driver-name-error">{fieldErrors.driver}</FieldError>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="driver-mobile">
                        Driver mobile (E.164) <RequiredIndicator />
                      </Label>
                      <Input
                        id="driver-mobile"
                        type="tel"
                        placeholder="+919876543210"
                        value={driverMobile}
                        maxLength={16}
                        onChange={(event) => {
                          setDriverMobile(event.target.value);
                          setFieldErrors((current) => ({ ...current, driverMobile: undefined }));
                        }}
                        aria-invalid={Boolean(fieldErrors.driverMobile)}
                        aria-describedby={
                          fieldErrors.driverMobile ? "driver-mobile-error" : undefined
                        }
                      />
                      <FieldError id="driver-mobile-error">{fieldErrors.driverMobile}</FieldError>
                    </div>
                  </div>
                </section>
              ) : null}

              <DialogFooter>
                {!CLOSED_STATUSES.includes(active.status) ? (
                  <Button
                    variant="outline"
                    disabled={busyId === active.id}
                    onClick={() => void cancel(active)}
                  >
                    Cancel pickup
                  </Button>
                ) : null}
                {active.status === "requested" ? (
                  <Button disabled={busyId === active.id} onClick={() => void arrange()}>
                    {busyId === active.id ? "Saving..." : "Mark arranged"}
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
