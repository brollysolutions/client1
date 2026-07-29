import { Card, CardHeader, CardTitle } from "@/components/ui/card";

// Reuses the Card stat pattern from admin-home.tsx: a plain grid of
// label + big number tiles. The tile values always come from the report's
// `summary` block (the FULL filtered set), never the current page of rows
// -- see lib/reports-api.ts's ReportSummary docstring for why those must
// never drift apart.
export function StatTiles({ tiles }: { tiles: { label: string; value: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-text-secondary">{tile.label}</CardTitle>
            <p className="mt-1 text-2xl font-semibold text-text-primary">{tile.value}</p>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
