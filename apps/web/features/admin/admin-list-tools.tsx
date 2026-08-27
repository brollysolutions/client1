import {
  DASHBOARD_PAGE_SIZE,
  ListPagination,
} from "@/features/dashboard/list-pagination";
import { isInDateRange } from "@/lib/date-range";

export { isInDateRange };

export const ADMIN_PAGE_SIZE = DASHBOARD_PAGE_SIZE;

export function AdminPagination({
  page,
  total,
  onPageChange,
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return <ListPagination page={page} total={total} onPageChange={onPageChange} label="Admin list pages" />;
}
