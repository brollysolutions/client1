import { Button } from "@/components/ui/button";
import { isInDateRange } from "@/lib/date-range";

export { isInDateRange };

export const ADMIN_PAGE_SIZE = 25;

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
