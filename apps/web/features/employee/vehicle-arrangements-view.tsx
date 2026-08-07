"use client";

import * as React from "react";
import { CarFront } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  listEmployeeVehicleArrangements,
  updateEmployeeVehicleArrangement,
  type VehicleArrangement,
  type VehicleArrangementStatus,
} from "@/lib/employee-api";

const STATUS_LABEL: Record<VehicleArrangementStatus, string> = {
  requested: "Requested",
  arranged: "Arranged",
  assigned: "Assigned",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-IN");
}

export function EmployeeVehicleArrangementsView() {
  const [items, setItems] = React.useState<VehicleArrangement[]>([]);
  const [filter, setFilter] = React.useState<VehicleArrangementStatus | "all">("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await listEmployeeVehicleArrangements(
      filter === "all" ? undefined : filter,
    );
    if (result.ok) {
      setItems(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [filter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function update(item: VehicleArrangement, status: "completed" | "cancelled") {
    setBusyId(item.id);
    const result = await updateEmployeeVehicleArrangement(item.id, { status });
    setBusyId(null);
    if (!result.ok) {
      toast.error("Could not update pickup", { description: result.error });
      return;
    }
    toast.success(status === "completed" ? "Pickup completed" : "Pickup cancelled");
    void load();
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Vehicle arrangements</h1>
        <p className="text-sm text-text-secondary">Site-visit pickups assigned to you.</p>
      </div>
      <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
        <SelectTrigger className="w-48" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="assigned">Assigned</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      {loading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <CarFront className="mx-auto h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium">No pickups assigned</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{item.property_title}</p>
                    <Badge variant="secondary">{STATUS_LABEL[item.status]}</Badge>
                  </div>
                  <p className="text-sm text-text-secondary">
                    {item.property_locality}, {item.property_city}
                  </p>
                  <p className="text-sm">Pickup: {item.pickup_location}</p>
                  <p className="text-sm text-text-secondary">{formatDateTime(item.pickup_at)}</p>
                  <p className="text-sm">
                    {item.vehicle_make_model} · {item.vehicle_registration}
                  </p>
                  <p className="text-sm">
                    Driver: {item.driver_name} · {item.driver_mobile}
                  </p>
                </div>
                {item.status === "assigned" ? (
                  <div className="flex gap-2">
                    <Button disabled={busyId === item.id} onClick={() => void update(item, "completed")}>
                      Complete
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busyId === item.id}
                      onClick={() => void update(item, "cancelled")}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
