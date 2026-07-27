import { LeadDialog } from "@/components/lead-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { contactHref } from "@/lib/leads";

// Renders in place of the property category rows when the catalog fetch
// returns no listings — either because the table is genuinely empty (a
// production first-deploy state) or because the fetch itself failed. The two
// cases are deliberately not distinguished here: a visitor cannot act on the
// difference, and a marketing page that reports an error it cannot explain
// is a worse experience than a quiet, honest card. Server Component; the
// only island is LeadDialog.

export function PropertyCatalogEmpty() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="font-heading text-xl text-foreground">
            New listings are on the way
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-text-secondary">
            We are verifying properties with our partners right now. Leave your number
            and we will call you as soon as something matches what you are looking for.
          </p>
          <LeadDialog
            businessLine="real_estate"
            triggerLabel="Get a callback"
            href={contactHref({ line: "real_estate" })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
