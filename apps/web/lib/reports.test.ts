import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildReportParams,
  formatConversionRate,
  nextSort,
  resolveDatePreset,
  toIsoDateIST,
} from "@/lib/reports";

describe("toIsoDateIST()", () => {
  it("rolls a late-evening UTC instant forward to the next IST calendar day", () => {
    // 2026-07-26T19:00:00Z is 00:30 IST on 2026-07-27.
    expect(toIsoDateIST(new Date("2026-07-26T19:00:00Z"))).toBe("2026-07-27");
  });

  it("keeps an early UTC instant on the same IST calendar day", () => {
    // 2026-07-26T05:00:00Z is 10:30 IST, same calendar day.
    expect(toIsoDateIST(new Date("2026-07-26T05:00:00Z"))).toBe("2026-07-26");
  });
});

describe("resolveDatePreset()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("this_week starts on the ISO Monday in IST", () => {
    // 2026-07-29T10:00:00Z is Wednesday 15:30 IST.
    const now = new Date("2026-07-29T10:00:00Z");
    vi.setSystemTime(now);
    const { dateFrom, dateTo } = resolveDatePreset("this_week", now);
    expect(dateFrom).toBe("2026-07-27"); // the Monday
    expect(dateTo).toBe("2026-07-29");
  });

  it("this_week rolls a late-Sunday-UTC instant into the following IST Monday's week", () => {
    // 2026-07-26T19:00:00Z is Sunday in UTC but 00:30 Monday in IST -- the
    // same canonical regression case the backend's IST bucketing test uses.
    const now = new Date("2026-07-26T19:00:00Z");
    const { dateFrom, dateTo } = resolveDatePreset("this_week", now);
    expect(dateFrom).toBe("2026-07-27");
    expect(dateTo).toBe("2026-07-27");
  });

  it("this_month starts on the 1st in IST", () => {
    const now = new Date("2026-07-15T10:00:00Z");
    const { dateFrom, dateTo } = resolveDatePreset("this_month", now);
    expect(dateFrom).toBe("2026-07-01");
    expect(dateTo).toBe("2026-07-15");
  });

  it("last_30_days is a 30-day inclusive window ending today", () => {
    const now = new Date("2026-07-30T10:00:00Z");
    const { dateFrom, dateTo } = resolveDatePreset("last_30_days", now);
    expect(dateFrom).toBe("2026-07-01");
    expect(dateTo).toBe("2026-07-30");
  });
});

describe("formatConversionRate()", () => {
  it("renders an em dash for zero total instead of NaN%", () => {
    expect(formatConversionRate(0, 0)).toBe("—");
  });

  it("renders a rounded percentage to one decimal place", () => {
    expect(formatConversionRate(3, 1)).toBe("33.3%");
  });

  it("renders 100% when every row converted", () => {
    expect(formatConversionRate(4, 4)).toBe("100%");
  });
});

describe("buildReportParams()", () => {
  it("always includes date_from and date_to", () => {
    const params = buildReportParams({ dateFrom: "2026-01-01", dateTo: "2026-01-31" });
    expect(params.get("date_from")).toBe("2026-01-01");
    expect(params.get("date_to")).toBe("2026-01-31");
    expect(params.has("bucket")).toBe(false);
    expect(params.has("business_line")).toBe(false);
  });

  it("appends one agent_profile_uuid per id, preserving order", () => {
    const params = buildReportParams({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      agentProfileUuids: ["a", "b"],
    });
    expect(params.getAll("agent_profile_uuid")).toEqual(["a", "b"]);
  });

  it("omits agent_profile_uuid entirely when the list is empty", () => {
    const params = buildReportParams({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      agentProfileUuids: [],
    });
    expect(params.has("agent_profile_uuid")).toBe(false);
  });

  it("includes sort and pagination params when provided", () => {
    const params = buildReportParams({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      sortBy: "total",
      sortDir: "asc",
      limit: 25,
      offset: 50,
    });
    expect(params.get("sort_by")).toBe("total");
    expect(params.get("sort_dir")).toBe("asc");
    expect(params.get("limit")).toBe("25");
    expect(params.get("offset")).toBe("50");
  });
});

describe("nextSort()", () => {
  it("defaults a fresh column to descending", () => {
    expect(nextSort({ sortBy: undefined, sortDir: "desc" }, "total")).toEqual({
      sortBy: "total",
      sortDir: "desc",
    });
  });

  it("flips direction when the same column is clicked again", () => {
    expect(nextSort({ sortBy: "total", sortDir: "desc" }, "total")).toEqual({
      sortBy: "total",
      sortDir: "asc",
    });
    expect(nextSort({ sortBy: "total", sortDir: "asc" }, "total")).toEqual({
      sortBy: "total",
      sortDir: "desc",
    });
  });

  it("resets to descending when switching to a different column", () => {
    expect(nextSort({ sortBy: "total", sortDir: "asc" }, "converted")).toEqual({
      sortBy: "converted",
      sortDir: "desc",
    });
  });
});
