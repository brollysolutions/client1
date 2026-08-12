export type OperationalRecord = {
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  fields: { label: string; value: string }[];
};

export function filterOperationalRecords(
  records: OperationalRecord[],
  search: string,
  status: string,
): OperationalRecord[] {
  const query = search.trim().toLocaleLowerCase();
  return records.filter((record) => {
    if (status !== "all" && record.status !== status) return false;
    if (!query) return true;
    return [
      record.title,
      record.subtitle,
      record.id,
      record.status ?? "",
      ...record.fields.flatMap((field) => [field.label, field.value]),
    ].some((value) => value.toLocaleLowerCase().includes(query));
  });
}
