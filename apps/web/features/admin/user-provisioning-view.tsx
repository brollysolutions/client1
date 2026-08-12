"use client";

import * as React from "react";
import { Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  MetricCard,
  MetricGrid,
} from "@/features/dashboard/dashboard-ui";
import {
  createStaff,
  getStaffAccess,
  setStaffFeature,
  type StaffAccessList,
  type StaffCreateRequest,
  type StaffCreateResponse,
} from "@/lib/admin-api";

import { TempCredentialPanel } from "./temp-credential-panel";
import { OperationalUsersPanel } from "./operational-users-panel";

type StaffRole = StaffCreateRequest["role"];
type AccessStatus = "loading" | "ready" | "restricted" | "error";

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "sub_admin", label: "Sub Admin" },
  { value: "telecaller", label: "Telecaller" },
  { value: "employee", label: "Employee" },
];

const LINE_OPTIONS: { value: "loans" | "real_estate" | "both"; label: string }[] = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
  { value: "both", label: "Both" },
];

const LINE_LABEL = Object.fromEntries(
  LINE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<(typeof LINE_OPTIONS)[number]["value"], string>;

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  mobile: "",
  email: "",
  role: "sub_admin" as StaffRole,
  business_line: "" as "" | "loans" | "real_estate" | "both",
};

export function UserProvisioningView() {
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<StaffCreateResponse | null>(null);
  const [access, setAccess] = React.useState<StaffAccessList | null>(null);
  const [accessStatus, setAccessStatus] = React.useState<AccessStatus>("loading");
  const [featureBusy, setFeatureBusy] = React.useState<string | null>(null);

  const needsLine = form.role !== "admin" && form.role !== "sub_admin";
  const visibleRoleOptions = access
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((option) => option.value !== "admin");

  const refreshAccess = React.useCallback(async () => {
    setAccessStatus("loading");
    const response = await getStaffAccess();
    if (response.ok) {
      setAccess(response.data);
      setAccessStatus("ready");
      return;
    }
    setAccess(null);
    setAccessStatus(response.status === 403 ? "restricted" : "error");
  }, []);

  React.useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (needsLine && !form.business_line) {
      toast.error("Choose a business line", {
        description: "Telecaller and Employee accounts must be assigned a line scope.",
      });
      return;
    }
    setSubmitting(true);
    const res = await createStaff({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      mobile: form.mobile.trim(),
      email: form.email.trim(),
      role: form.role,
      business_line: needsLine
        ? (form.business_line as "loans" | "real_estate" | "both")
        : null,
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Account created");
      setResult(res.data);
      setForm(EMPTY_FORM);
      void refreshAccess();
    } else {
      toast.error("Could not create account", { description: res.error });
    }
  }

  const subAdmins = access?.entries.filter((entry) => entry.role === "sub_admin") ?? [];
  const payoutDelegates = subAdmins.filter((entry) =>
    entry.features.includes("payout_requests"),
  ).length;
  const additionalAdminSlots = access
    ? Math.max(access.additional_admin_limit - access.additional_admin_count, 0)
    : null;

  return (
    <DashboardPage>
      <DashboardHeader
        eyebrow="Identity and access"
        title="Users & staff"
        description="Provision operational accounts, assign business-line scope, and manage delegated access."
        actions={
          <Button asChild>
            <a href="#create-staff">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Create staff account
            </a>
          </Button>
        }
      />

      <MetricGrid>
        <MetricCard
          label="Provisionable roles"
          value={visibleRoleOptions.length}
          hint={access ? "Includes additional Admins" : "Sub Admin, Telecaller, Employee"}
          icon={DASHBOARD_ICONS.usersAndStaff}
        />
        <MetricCard
          label="Line-scoped roles"
          value="2"
          hint="Telecaller and Employee"
          icon={DASHBOARD_ICONS.accessControl}
        />
        <MetricCard
          label="Additional Admin slots"
          value={additionalAdminSlots ?? "—"}
          hint={access ? `${access.additional_admin_count} of ${access.additional_admin_limit} active` : "Main Admin view only"}
          icon={DASHBOARD_ICONS.usersAndStaff}
        />
        <MetricCard
          label="Payout delegates"
          value={access ? payoutDelegates : "—"}
          hint={access ? `${subAdmins.length} active Sub Admins` : "Main Admin view only"}
          icon={DASHBOARD_ICONS.payouts}
        />
      </MetricGrid>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
        <DashboardPanel
          title={result ? "Account created" : "Create staff account"}
          description={
            result
              ? "Review the new account details and securely hand off any one-time credential."
              : "New accounts receive the selected role and the narrowest applicable line scope."
          }
          className="min-h-[540px] scroll-mt-24"
        >
          <div id="create-staff" className="scroll-mt-24">
            {result ? (
              <ProvisioningResult result={result} onReset={() => setResult(null)} />
            ) : (
              <form className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="first_name">First name</Label>
                    <Input
                      id="first_name"
                      required
                      maxLength={100}
                      value={form.first_name}
                      onChange={(event) => setField("first_name", event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="last_name">Last name</Label>
                    <Input
                      id="last_name"
                      required
                      maxLength={100}
                      value={form.last_name}
                      onChange={(event) => setField("last_name", event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="mobile">Mobile number</Label>
                    <Input
                      id="mobile"
                      required
                      inputMode="tel"
                      placeholder="+919812345678"
                      pattern="^\+[1-9]\d{6,14}$"
                      value={form.mobile}
                      onChange={(event) => setField("mobile", event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={(event) => setField("email", event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="role">Role</Label>
                    <Select
                      value={form.role}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          role: value as StaffRole,
                          business_line: "",
                        }))
                      }
                    >
                      <SelectTrigger id="role">
                        <SelectValue placeholder="Choose a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {visibleRoleOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            disabled={
                              option.value === "admin" && additionalAdminSlots === 0
                            }
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {needsLine ? (
                    <div>
                      <Label htmlFor="business_line">Business line</Label>
                      <Select
                        value={form.business_line}
                        onValueChange={(value) =>
                          setField(
                            "business_line",
                            value as "loans" | "real_estate" | "both",
                          )
                        }
                      >
                        <SelectTrigger id="business_line">
                          <SelectValue placeholder="Choose a line" />
                        </SelectTrigger>
                        <SelectContent>
                          {LINE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-text-secondary">
                      Admin and Sub Admin accounts operate across both business lines.
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-text-secondary">
                  A temporary password is shown once for a new identity. Existing accounts keep
                  their current password.
                </div>

                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                  )}
                  {submitting ? "Creating account…" : "Create account"}
                </Button>
              </form>
            )}
          </div>
        </DashboardPanel>

        <DashboardPanel
          title="Staff access"
          description="Admin hierarchy and delegated operational capabilities"
          className="min-h-[540px]"
        >
          <StaffAccessContent
            access={access}
            status={accessStatus}
            featureBusy={featureBusy}
            onRetry={refreshAccess}
            onFeatureChange={async (staffProfileUuid, enabled) => {
              setFeatureBusy(staffProfileUuid);
              const response = await setStaffFeature(staffProfileUuid, enabled);
              setFeatureBusy(null);
              if (response.ok) {
                setAccess(response.data);
                setAccessStatus("ready");
                toast.success(enabled ? "Payout access granted" : "Payout access revoked", {
                  description: "The Sub Admin must sign in again.",
                });
              } else {
                toast.error("Could not update access", { description: response.error });
              }
            }}
          />
        </DashboardPanel>
      </div>

      <DashboardPanel
        title="Operational accounts"
        description="Platform-wide account oversight. Suspending an account immediately invalidates its sessions; deleted and Main Admin accounts are protected."
      >
        <OperationalUsersPanel />
      </DashboardPanel>
    </DashboardPage>
  );
}

function ProvisioningResult({
  result,
  onReset,
}: {
  result: StaffCreateResponse;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-text-primary">
              {result.first_name} {result.last_name}
            </p>
            <p className="mt-1 text-sm text-text-secondary">{result.mobile}</p>
          </div>
          <Badge variant="outline">{result.staff_code}</Badge>
        </div>
        <p className="mt-3 text-sm text-text-secondary">
          {ROLE_OPTIONS.find((role) => role.value === result.role)?.label ?? result.role}
          {result.business_line ? ` · ${LINE_LABEL[result.business_line]}` : " · Platform"}
        </p>
      </div>

      {result.temp_password ? (
        <TempCredentialPanel mobile={result.mobile} tempPassword={result.temp_password} />
      ) : (
        <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-text-secondary">
          This mobile number already had an account. Its existing password still works, so no new
          credential was issued.
        </p>
      )}

      <Button variant="outline" onClick={onReset}>
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Provision another
      </Button>
    </div>
  );
}

function StaffAccessContent({
  access,
  status,
  featureBusy,
  onRetry,
  onFeatureChange,
}: {
  access: StaffAccessList | null;
  status: AccessStatus;
  featureBusy: string | null;
  onRetry: () => Promise<void>;
  onFeatureChange: (staffProfileUuid: string, enabled: boolean) => Promise<void>;
}) {
  if (status === "loading") {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading staff access…
      </div>
    );
  }

  if (status === "restricted") {
    return (
      <div className="flex min-h-48 items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-cta-tint text-brand-cta">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-medium text-text-primary">Main Admin controls</p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            You can provision Sub Admin, Telecaller, and Employee accounts. Only the Main Admin
            can create additional Admins or manage payout-request delegation.
          </p>
        </div>
      </div>
    );
  }

  if (status === "error" || !access) {
    return (
      <div className="flex min-h-48 flex-col items-start justify-center rounded-xl border border-border bg-muted/30 p-4">
        <p className="font-medium text-text-primary">Staff access is unavailable</p>
        <p className="mt-1 text-sm text-text-secondary">
          Provisioning remains available. Retry the hierarchy and delegation view.
        </p>
        <Button className="mt-4" variant="outline" size="sm" onClick={() => void onRetry()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-text-primary">Additional Admin capacity</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            Main Admin is permanent and does not consume an additional slot.
          </p>
        </div>
        <Badge variant="outline">
          {access.additional_admin_count} / {access.additional_admin_limit} active
        </Badge>
      </div>

      <div className="max-h-[340px] overflow-auto rounded-xl border border-border [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Staff member</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Scope</th>
              <th className="px-4 py-3 font-medium">Delegated access</th>
            </tr>
          </thead>
          <tbody>
            {access.entries.map((entry) => {
              const enabled = entry.features.includes("payout_requests");
              const busy = featureBusy === entry.staff_profile_uuid;
              return (
                <tr key={entry.staff_profile_uuid} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text-primary">
                      {entry.first_name} {entry.last_name}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">{entry.staff_code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {entry.role === "sub_admin" ? "Sub Admin" : "Admin"}
                      </Badge>
                      {entry.is_primary_admin ? (
                        <Badge className="bg-brand-cta-tint text-brand-cta">Main</Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">Platform</td>
                  <td className="px-4 py-3">
                    {entry.role === "sub_admin" ? (
                      <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-cta"
                          checked={enabled}
                          disabled={busy}
                          onChange={(event) =>
                            void onFeatureChange(
                              entry.staff_profile_uuid,
                              event.target.checked,
                            )
                          }
                        />
                        Prepare payout requests
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : null}
                      </label>
                    ) : (
                      <span className="text-text-secondary">
                        {entry.is_primary_admin ? "Full platform control" : "Admin operations"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-5 text-text-secondary">
        Changing payout delegation invalidates the Sub Admin&apos;s current sessions; they must sign
        in again before the updated access takes effect.
      </p>
    </div>
  );
}
