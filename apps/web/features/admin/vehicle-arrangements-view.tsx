"use client";

import * as React from "react";
import { CarFront, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  listAdminVehicleArrangements,
  updateAdminVehicleArrangement,
  type VehicleArrangement,
  type VehicleArrangementStatus,
} from "@/lib/admin-api";

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
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<VehicleArrangement | null>(null);
  const [vehicle, setVehicle] = React.useState("");
  const [registration, setRegistration] = React.useState("");
  const [driver, setDriver] = React.useState("");
  const [driverMobile, setDriverMobile] = React.useState("");
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

  function openArrange(item: VehicleArrangement) {
    setActive(item);
    setVehicle(item.vehicle_make_model ?? "");
    setRegistration(item.vehicle_registration ?? "");
    setDriver(item.driver_name ?? "");
    setDriverMobile(item.driver_mobile ?? "");
  }

  async function arrange() {
    if (!active || !vehicle.trim() || !registration.trim() || !driver.trim() || !driverMobile) {
      toast.error("Enter all vehicle and driver details.");
      return;
    }
    setBusyId(active.id);
    const result = await updateAdminVehicleArrangement(active.id, {
      status: "arranged",
      vehicle_make_model: vehicle.trim(),
      vehicle_registration: registration.trim(),
      driver_name: driver.trim(),
      driver_mobile: driverMobile,
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

      <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
        <SelectTrigger className="w-48" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <CarFront className="mx-auto h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium">No vehicle arrangements</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
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

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arrange vehicle</DialogTitle>
            <DialogDescription>Enter the confirmed vehicle and driver details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="vehicle-model">Vehicle make and model</Label>
              <Input id="vehicle-model" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vehicle-registration">Registration number</Label>
              <Input
                id="vehicle-registration"
                value={registration}
                onChange={(e) => setRegistration(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="driver-name">Driver name</Label>
              <Input id="driver-name" value={driver} onChange={(e) => setDriver(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="driver-mobile">Driver mobile (E.164)</Label>
              <Input
                id="driver-mobile"
                type="tel"
                placeholder="+919876543210"
                value={driverMobile}
                onChange={(e) => setDriverMobile(e.target.value)}
              />
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
