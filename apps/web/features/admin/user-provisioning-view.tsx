"use client";

import * as React from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

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
import { createStaff, type StaffCreateRequest, type StaffCreateResponse } from "@/lib/admin-api";
import { TempCredentialPanel } from "./temp-credential-panel";

type StaffRole = StaffCreateRequest["role"];

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
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

  const needsLine = form.role !== "sub_admin";

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (needsLine && !form.business_line) {
      toast.error("Choose a business line", {
        description: "Telecaller and Employee accounts are scoped to one line.",
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
      business_line: needsLine ? (form.business_line as "loans" | "real_estate") : null,
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Account created");
      setResult(res.data);
      setForm(EMPTY_FORM);
    } else {
      toast.error("Could not create account", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Provision staff</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Create a Sub Admin, Telecaller, or Employee account. A temp password is shown once,
          share it securely, they set their own password on first login.
        </p>
      </div>

      {result ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="font-medium text-text-primary">
              {result.first_name} {result.last_name}
            </p>
            <p className="text-sm text-text-secondary">
              {ROLE_OPTIONS.find((r) => r.value === result.role)?.label ?? result.role}
              {result.business_line ? ` · ${LINE_LABEL[result.business_line]}` : ""}
              {" · "}
              {result.staff_code}
            </p>
          </div>
          {result.temp_password ? (
            <TempCredentialPanel mobile={result.mobile} tempPassword={result.temp_password} />
          ) : (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-text-secondary">
              This mobile number already had an account. Their existing password still works, no
              new credential was issued.
            </p>
          )}
          <Button variant="outline" onClick={() => setResult(null)}>
            <UserPlus className="h-4 w-4" />
            Provision another
          </Button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                required
                maxLength={100}
                value={form.first_name}
                onChange={(e) => setField("first_name", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                required
                maxLength={100}
                value={form.last_name}
                onChange={(e) => setField("last_name", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="mobile">Mobile number</Label>
            <Input
              id="mobile"
              required
              placeholder="+919812345678"
              pattern="^\+[1-9]\d{6,14}$"
              value={form.mobile}
              onChange={(e) => setField("mobile", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="role">Role</Label>
            <Select
              value={form.role}
              onValueChange={(v) =>
                setForm((prev) => ({ ...prev, role: v as StaffRole, business_line: "" }))
              }
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
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
                onValueChange={(v) =>
                  setField("business_line", v as "loans" | "real_estate" | "both")
                }
              >
                <SelectTrigger id="business_line">
                  <SelectValue placeholder="Choose a line" />
                </SelectTrigger>
                <SelectContent>
                  {LINE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-xs text-text-secondary">
              Sub Admin acts across both business lines.
            </p>
          )}

          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Create account
          </Button>
        </form>
      )}
    </div>
  );
}
