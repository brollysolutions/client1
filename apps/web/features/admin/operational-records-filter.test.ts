import { describe, expect, it } from "vitest";

import { filterOperationalRecords, type OperationalRecord } from "./operational-records-filter";

const records: OperationalRecord[] = [
  {
    id: "auth-1",
    title: "Login succeeded",
    subtitle: "Successful authentication event",
    status: "Success",
    fields: [{ label: "Account", value: "account-1" }],
  },
  {
    id: "visit-1",
    title: "Meridian Heights",
    subtitle: "Bengaluru site visit",
    status: "Cancelled",
    fields: [{ label: "Property reference", value: "meridian-17" }],
  },
];

describe("operational record filters", () => {
  it("matches the already-authorized record fields without fetching more data", () => {
    expect(filterOperationalRecords(records, "meridian-17", "all")).toEqual([records[1]]);
  });

  it("combines text and status filters", () => {
    expect(filterOperationalRecords(records, "event", "Success")).toEqual([records[0]]);
    expect(filterOperationalRecords(records, "event", "Cancelled")).toEqual([]);
  });
});
