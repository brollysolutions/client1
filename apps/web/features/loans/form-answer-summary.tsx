import type { components } from "@contracts/generated/schema";

import { formatINR } from "@/lib/format";

type FormSchema = components["schemas"]["ProductFormDefinition"];

function displayValue(
  field: FormSchema["sections"][number]["fields"][number],
  value: string | string[],
): string {
  const optionLabels = new Map((field.options ?? []).map((option) => [option.value, option.label]));
  if (Array.isArray(value)) return value.map((item) => optionLabels.get(item) ?? item).join(", ");
  if (field.input_type === "select") return optionLabels.get(value) ?? value;
  if (field.input_type === "currency") return formatINR(Number(value));
  if (field.input_type === "date") {
    const date = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    }
  }
  return value;
}

export function FormAnswerSummary({
  schema,
  answers,
}: {
  schema: FormSchema | null | undefined;
  answers: Record<string, string | string[]> | null | undefined;
}) {
  if (!schema || !answers) return null;
  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/25 p-4">
      <h3 className="font-semibold text-text-primary">Submitted application details</h3>
      {schema.sections.map((section) => {
        const answeredFields = section.fields.filter((field) => answers[field.key] !== undefined);
        if (answeredFields.length === 0) return null;
        return (
          <section key={section.key}>
            <h4 className="text-sm font-medium text-text-primary">{section.title}</h4>
            <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {answeredFields.map((field) => (
                <div key={field.key}>
                  <dt className="text-xs text-text-secondary">{field.label}</dt>
                  <dd className="mt-0.5 break-words text-sm text-text-primary">
                    {displayValue(field, answers[field.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
