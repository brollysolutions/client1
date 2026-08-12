import { Button } from "@/components/ui/button";

export const ADMIN_PAGE_SIZE = 25;

export function isInDateRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const date = value.slice(0, 10);
  return (!from || date >= from) && (!to || date <= to);
}

export function AdminPagination({
  page,
  total,
  onPageChange,
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const start = total === 0 ? 0 : page * ADMIN_PAGE_SIZE + 1;
  const end = Math.min((page + 1) * ADMIN_PAGE_SIZE, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <p className="text-xs text-text-secondary">Showing {start}-{end} of {total}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={end >= total} onClick={() => onPageChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
