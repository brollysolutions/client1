"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

const OPTIONS = [
  { value: "light", label: "Light", description: "A bright workspace.", icon: Sun },
  { value: "dark", label: "Dark", description: "A softer view in low light.", icon: Moon },
  { value: "system", label: "System", description: "Follow your device. Default.", icon: Monitor },
] as const;

export function AppearanceSettingsCard() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <fieldset aria-describedby="appearance-description">
        <legend className="text-base font-semibold text-text-primary">Appearance</legend>
        <p id="appearance-description" className="mt-1 text-sm text-text-secondary">
          Choose how your dashboard looks on this device. Public and sign-in pages always follow your system.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {OPTIONS.map(({ value, label, description, icon: Icon }) => (
            <label key={value} className="relative flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 has-[:checked]:border-brand-sky has-[:checked]:bg-surface-sky has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
              <input type="radio" name="dashboard-appearance" value={value}
                className="mt-1 accent-brand-navy" checked={(mounted ? theme ?? "system" : "system") === value}
                disabled={!mounted} onChange={() => setTheme(value)} />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium text-text-primary"><Icon className="h-4 w-4" aria-hidden="true" />{label}</span>
                <span className="mt-1 block text-xs text-text-secondary">{description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
