"use client";

import * as React from "react";
import { CarFront, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import {
  e164PhoneError,
  focusFirstInvalidField,
  requiredTextError,
  type FieldErrors,
} from "@/lib/form-validation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAdminVehicleArrangements,
  updateAdminVehicleArrangement,
  type VehicleArrangement,
  type VehicleArrangementStatus,
} from "@/lib/admin-api";
import { AdminPagination, ADMIN_PAGE_SIZE, isInDateRange } from "./admin-list-tools";

const STATUS_LABEL: Record<VehicleArrangementStatus, string> = {
  requested: "Requested",
  arranged: "Arranged",
  assigned: "Assigned",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatDateTime(value: string): string {
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

export function AdminVehicleArrangementsView() {
  const [items, setItems] = React.useState<VehicleArrangement[]>([]);
  const [filter, setFilter] = React.useState<VehicleArrangementStatus | "all">("all");
  const [search, setSearch] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<VehicleArrangement | null>(null);
  const [vehicle, setVehicle] = React.useState("");
  const [registration, setRegistration] = React.useState("");
  const [driver, setDriver] = React.useState("");
  const [driverMobile, setDriverMobile] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<
    FieldErrors<"vehicle" | "registration" | "driver" | "driverMobile">
  >({});
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const arrangements = await listAdminVehicleArrangements(
      filter === "all" ? undefined : filter,
    );
    if (!arrangements.ok) {
      setError(arrangements.error);
      setLoading(false);
      return;
    }
    setItems(arrangements.data);
    setLoading(false);
  }, [filter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = React.useMemo(() => items.filter((item) => (
    isInDateRange(item.pickup_at, dateFrom, dateTo) &&
    `${item.property_title} ${item.property_city} ${item.assigned_employee_name ?? ""}`.toLowerCase().includes(search.toLowerCase())
  )), [dateFrom, dateTo, items, search]);
  React.useEffect(() => setPage(0), [dateFrom, dateTo, filter, search]);
  const pageItems = filteredItems.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);

  function openArrange(item: VehicleArrangement) {
    setActive(item);
    setVehicle(item.vehicle_make_model ?? "");
    setRegistration(item.vehicle_registration ?? "");
    setDriver(item.driver_name ?? "");
    setDriverMobile(item.driver_mobile ?? "");
    setFieldErrors({});
  }

  async function arrange() {
    if (!active) return;
    const errors = {
      vehicle: requiredTextError(vehicle, "Vehicle make and model", 160),
      registration: requiredTextError(registration, "Registration number", 40),
      driver: requiredTextError(driver, "Driver name", 120),
      driverMobile: e164PhoneError(driverMobile, { required: true }),
    };
    const nextErrors = Object.fromEntries(
      Object.entries(errors).filter(([, error]) => error),
    ) as typeof fieldErrors;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      requestAnimationFrame(() => {
        if (dialogRef.current) focusFirstInvalidField(dialogRef.current);
      });
      return;
    }
    setBusyId(active.id);
    const result = await updateAdminVehicleArrangement(active.id, {
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
    setActive(null);
    toast.success("Vehicle arranged");
    void load();
  }

  async function update(
    item: VehicleArrangement,
    payload: Parameters<typeof updateAdminVehicleArrangement>[1],
    success: string,
  ) {
    setBusyId(item.id);
    const result = await updateAdminVehicleArrangement(item.id, payload);
    setBusyId(null);
    if (!result.ok) {
      toast.error("Could not update arrangement", { description: result.error });
      return;
    }
    toast.success(success);
    void load();
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Vehicle arrangements</h1>
        <p className="text-sm text-text-secondary">
          Confirm transport details; the platform assigns an eligible Employee automatically.
        </p>
      </div>

      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input aria-label="Search vehicle arrangements" placeholder="Property, city, or Employee" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} />
        <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}><SelectTrigger aria-label="Filter vehicle arrangements by status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.entries(STATUS_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <Input aria-label="Vehicle arrangements from pickup date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <Input aria-label="Vehicle arrangements to pickup date" type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading arrangements" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button className="mt-4" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <CarFront className="mx-auto h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium">No vehicle arrangements</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {pageItems.map((item) => (
            <li key={item.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-text-primary">{item.property_title}</p>
                    <Badge variant="secondary">{STATUS_LABEL[item.status]}</Badge>
                  </div>
                  <p className="text-sm text-text-secondary">
                    {item.property_locality}, {item.property_city}
                  </p>
                  <p className="text-sm text-text-secondary">Pickup: {item.pickup_location}</p>
                  <p className="text-sm text-text-secondary">{formatDateTime(item.pickup_at)}</p>
                  {item.vehicle_make_model ? (
                    <p className="text-sm">
                      {item.vehicle_make_model} · {item.vehicle_registration} · {item.driver_name}
                    </p>
                  ) : null}
                  {item.assigned_employee_name ? (
                    <p className="text-sm">Assigned to {item.assigned_employee_name}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.status === "requested" ? (
                    <Button onClick={() => openArrange(item)}>Enter transport details</Button>
                  ) : null}
                  {!(["completed", "cancelled"] as string[]).includes(item.status) ? (
                    <Button
                      variant="outline"
                      disabled={busyId === item.id}
                      onClick={() => void update(item, { status: "cancelled" }, "Pickup cancelled")}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && filteredItems.length > 0 ? <AdminPagination page={page} total={filteredItems.length} onPageChange={setPage} /> : null}

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent ref={dialogRef}>
          <DialogHeader>
            <DialogTitle>Arrange vehicle</DialogTitle>
            <DialogDescription>Enter the confirmed vehicle and driver details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="vehicle-model">Vehicle make and model <RequiredIndicator /></Label>
              <Input id="vehicle-model" value={vehicle} maxLength={160} onChange={(e) => { setVehicle(e.target.value); setFieldErrors((current) => ({ ...current, vehicle: undefined })); }} aria-invalid={Boolean(fieldErrors.vehicle)} aria-describedby={fieldErrors.vehicle ? "vehicle-model-error" : undefined} />
              <FieldError id="vehicle-model-error">{fieldErrors.vehicle}</FieldError>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vehicle-registration">Registration number <RequiredIndicator /></Label>
              <Input
                id="vehicle-registration"
                value={registration}
                maxLength={40}
                onChange={(e) => { setRegistration(e.target.value); setFieldErrors((current) => ({ ...current, registration: undefined })); }}
                aria-invalid={Boolean(fieldErrors.registration)}
                aria-describedby={fieldErrors.registration ? "vehicle-registration-error" : undefined}
              />
              <FieldError id="vehicle-registration-error">{fieldErrors.registration}</FieldError>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="driver-name">Driver name <RequiredIndicator /></Label>
              <Input id="driver-name" value={driver} maxLength={120} onChange={(e) => { setDriver(e.target.value); setFieldErrors((current) => ({ ...current, driver: undefined })); }} aria-invalid={Boolean(fieldErrors.driver)} aria-describedby={fieldErrors.driver ? "driver-name-error" : undefined} />
              <FieldError id="driver-name-error">{fieldErrors.driver}</FieldError>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="driver-mobile">Driver mobile (E.164) <RequiredIndicator /></Label>
              <Input
                id="driver-mobile"
                type="tel"
                placeholder="+919876543210"
                value={driverMobile}
                maxLength={16}
                onChange={(e) => { setDriverMobile(e.target.value); setFieldErrors((current) => ({ ...current, driverMobile: undefined })); }}
                aria-invalid={Boolean(fieldErrors.driverMobile)}
                aria-describedby={fieldErrors.driverMobile ? "driver-mobile-error" : undefined}
              />
              <FieldError id="driver-mobile-error">{fieldErrors.driverMobile}</FieldError>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={busyId === active?.id} onClick={() => void arrange()}>
              {busyId === active?.id ? "Saving..." : "Mark arranged"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
