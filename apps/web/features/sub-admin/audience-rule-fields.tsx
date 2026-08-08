"use client";

import * as React from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";

import type { components } from "@contracts/generated/schema";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Schemas = components["schemas"];
export type AudienceRules = Schemas["AudienceRules"];
type UserType = NonNullable<AudienceRules["user_types"]>[number];
type ClientStage = NonNullable<AudienceRules["client_journey_stages"]>[number];
type AgentSignal = NonNullable<AudienceRules["agent_signals"]>[number];
type LocationCircle = Schemas["AudienceLocationCircle"];

const CLIENT_STAGES: { value: ClientStage; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "closed", label: "Closed enquiry" },
];

const AGENT_SIGNALS: { value: AgentSignal; label: string }[] = [
  { value: "no_leads", label: "No leads yet" },
  { value: "has_active_leads", label: "Has active leads" },
  { value: "has_converted_leads", label: "Has converted leads" },
  { value: "has_pending_commission", label: "Has pending commission" },
  { value: "has_paid_commission", label: "Has paid commission" },
];

export function emptyAudienceRules(): AudienceRules {
  return {
    version: 1,
    user_types: [],
    client_journey_stages: [],
    agent_signals: [],
    locations: [],
  };
}

export function normalizeAudienceRules(rules?: AudienceRules | null): AudienceRules {
  return {
    version: 1,
    user_types: rules?.user_types ?? [],
    client_journey_stages: rules?.client_journey_stages ?? [],
    agent_signals: rules?.agent_signals ?? [],
    locations: rules?.locations ?? [],
  };
}

export function audienceSummary(rules?: AudienceRules | null): string {
  const normalized = normalizeAudienceRules(rules);
  const types = normalized.user_types ?? [];
  if (types.length === 0) return "Everyone";
  const details: string[] = [types.map((type) => (type === "client" ? "Clients" : "Agents")).join(" + ")];
  const signals =
    (normalized.client_journey_stages?.length ?? 0) + (normalized.agent_signals?.length ?? 0);
  if (signals > 0) details.push(`${signals} workflow ${signals === 1 ? "signal" : "signals"}`);
  if (normalized.locations?.length) {
    details.push(`${normalized.locations.length} ${normalized.locations.length === 1 ? "area" : "areas"}`);
  }
  return details.join(" · ");
}

function toggleValue<T extends string>(values: T[], value: T, checked: boolean): T[] {
  return checked ? [...values, value] : values.filter((item) => item !== value);
}

export function withClientJourneyStages(
  rules: AudienceRules,
  stages: ClientStage[],
): AudienceRules {
  const normalized = normalizeAudienceRules(rules);
  return {
    ...normalized,
    user_types: stages.length > 0 ? ["client"] : normalized.user_types,
    client_journey_stages: stages,
    agent_signals: stages.length > 0 ? [] : normalized.agent_signals,
  };
}

export function withAgentSignals(
  rules: AudienceRules,
  signals: AgentSignal[],
): AudienceRules {
  const normalized = normalizeAudienceRules(rules);
  return {
    ...normalized,
    user_types: signals.length > 0 ? ["agent"] : normalized.user_types,
    client_journey_stages: signals.length > 0 ? [] : normalized.client_journey_stages,
    agent_signals: signals,
  };
}

export function AudienceRuleFields({
  value,
  onChange,
  required = false,
  disabled = false,
  allowedUserTypes = ["client", "agent"],
}: {
  value: AudienceRules;
  onChange: (next: AudienceRules) => void;
  required?: boolean;
  disabled?: boolean;
  allowedUserTypes?: UserType[];
}) {
  const rules = normalizeAudienceRules(value);
  const userTypes = rules.user_types ?? [];
  const clientStages = rules.client_journey_stages ?? [];
  const agentSignals = rules.agent_signals ?? [];
  const locations = rules.locations ?? [];

  function setUserType(type: UserType, checked: boolean) {
    const nextTypes = toggleValue(userTypes, type, checked);
    onChange({
      ...rules,
      user_types: nextTypes,
      client_journey_stages:
        (type === "client" && !checked) || (type === "agent" && checked)
          ? []
          : clientStages,
      agent_signals:
        (type === "agent" && !checked) || (type === "client" && checked)
          ? []
          : agentSignals,
      locations: nextTypes.length === 0 ? [] : locations,
    });
  }

  function updateLocation(index: number, patch: Partial<LocationCircle>) {
    onChange({
      ...rules,
      locations: locations.map((circle, circleIndex) =>
        circleIndex === index ? { ...circle, ...patch } : circle,
      ),
    });
  }

  return (
    <fieldset className="space-y-5 rounded-xl border border-border bg-muted/20 p-4" disabled={disabled}>
      <legend className="text-sm font-semibold text-text-primary">Audience targeting</legend>
      <p className="mt-1 text-xs text-text-secondary">
        Different sections are combined. Multiple choices inside one section are alternatives.
        {required ? " Select at least one user type." : " Leave user types empty for everyone."}
      </p>

      <div className="space-y-2">
        <p className="text-sm font-medium text-text-primary">User type</p>
        <div className="flex flex-wrap gap-4">
          {allowedUserTypes.map((type) => (
            <Label key={type} className="flex cursor-pointer items-center gap-2 font-normal">
              <Checkbox
                checked={userTypes.includes(type)}
                onCheckedChange={(checked) => setUserType(type, checked === true)}
              />
              {type === "client" ? "Clients" : "Agents"}
            </Label>
          ))}
        </div>
        {required && userTypes.length === 0 ? (
          <p className="text-xs text-destructive">A personalized banner needs a user type.</p>
        ) : null}
      </div>

      {userTypes.includes("client") ? (
        <RuleCheckboxes
          label="Client journey"
          options={CLIENT_STAGES}
          values={clientStages}
          onChange={(next) => onChange(withClientJourneyStages(rules, next))}
        />
      ) : null}

      {userTypes.includes("agent") ? (
        <RuleCheckboxes
          label="Agent activity"
          options={AGENT_SIGNALS}
          values={agentSignals}
          onChange={(next) => onChange(withAgentSignals(rules, next))}
        />
      ) : null}

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Geographic areas</p>
            <p className="text-xs text-text-secondary">Optional circles, from 5 to 500 km.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={userTypes.length === 0 || locations.length >= 10}
            onClick={() =>
              onChange({
                ...rules,
                locations: [
                  ...locations,
                  { label: `Area ${locations.length + 1}`, latitude: 0, longitude: 0, radius_km: 25 },
                ],
              })
            }
          >
            <Plus className="h-4 w-4" /> Add area
          </Button>
        </div>

        {locations.map((circle, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                <MapPin className="h-4 w-4" /> Area {index + 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove area ${index + 1}`}
                onClick={() =>
                  onChange({ ...rules, locations: locations.filter((_, item) => item !== index) })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor={`audience-area-${index}-label`}>Label</Label>
                <Input
                  id={`audience-area-${index}-label`}
                  value={circle.label}
                  maxLength={80}
                  onChange={(event) => updateLocation(index, { label: event.target.value })}
                />
              </div>
              <NumberField
                id={`audience-area-${index}-latitude`}
                label="Latitude"
                value={circle.latitude}
                min={-90}
                max={90}
                onChange={(latitude) => updateLocation(index, { latitude })}
              />
              <NumberField
                id={`audience-area-${index}-longitude`}
                label="Longitude"
                value={circle.longitude}
                min={-180}
                max={180}
                onChange={(longitude) => updateLocation(index, { longitude })}
              />
              <NumberField
                id={`audience-area-${index}-radius`}
                label="Radius (km)"
                value={circle.radius_km}
                min={5}
                max={500}
                onChange={(radius_km) => updateLocation(index, { radius_km })}
              />
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function RuleCheckboxes<T extends string>({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  values: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text-primary">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <Label key={option.value} className="flex cursor-pointer items-center gap-2 font-normal">
            <Checkbox
              checked={values.includes(option.value)}
              onCheckedChange={(checked) =>
                onChange(toggleValue(values, option.value, checked === true))
              }
            />
            {option.label}
          </Label>
        ))}
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        step="any"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
