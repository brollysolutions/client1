"""Admin analytics & reporting endpoints (FR-16.1-16.3, feature-status.md §3 #2).

New router file rather than an addition to api/v1/admin.py (already 949 lines
before this slice; the repo has 26 per-domain routers, so a new one is the
convention here, not an exception). Mounted at /api/v1/admin/reports in
main.py.

Gated by `deps.require_platform_admin` (feature-status.md §2-20), not the
role-only `deps.require_admin`: every RLS admin-bypass predicate in this
codebase is `role='admin' AND platform_scope='true'`. A line-scoped admin
who passed a role-only guard would not get a 403 -- they would get a
*silently partial* result set from these aggregate queries, which is worse,
because the numbers would still look real.

The StreamingResponse trap. A generator that lazily awaits db.execute(...)
while the HTTP body streams can outlive Depends(get_db)'s teardown, and
there is zero precedent for this pattern anywhere in this codebase to copy.
Every export handler below therefore fetches and fully materializes its rows
BEFORE constructing the StreamingResponse; the generator that follows
(_csv_chunks) touches only the in-memory list, never the session.

No audit-log row is written for an export. It is a read, in the same
category as GET /admin/leads and GET /admin/audit-log itself, neither of
which is audited -- adding one would cost a new AuditAction enum value, its
own direct-to-5432 migration, and a rolling restart (ADR-0004) for something
FR-16 does not ask for.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Generator
from datetime import date
from typing import Literal
from uuid import UUID

import xlsxwriter
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.brand import LOGO_PNG, branded_filename
from app.core.deps import CurrentUser, get_active_user, require_platform_admin
from app.db.session import get_db
from app.schemas.reporting import (
    AgentsReportResponse,
    AgentsReportRow,
    AgentsSummary,
    DealsReportResponse,
    DealsReportRow,
    LeadsReportResponse,
    LeadsReportRow,
    LoansReportResponse,
    LoansReportRow,
    ReportSummary,
    TeamPerformanceSummary,
)
from app.services import reporting

router = APIRouter()


def _validate_range(date_from: date, date_to: date) -> None:
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="date_from must not be after date_to.",
        )


def _map_sort_error(exc: reporting.InvalidSortField) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=f"Cannot sort by {exc}.",
    )


_FORMULA_LEAD_CHARS = ("=", "+", "-", "@", "\t", "\r")


def _csv_cell(value: object) -> str:
    """Defends against CSV/formula injection (OWASP): `agent_name` is free-text
    supplied by the agent themself at registration, not by the admin who later
    opens this export. A name starting with =, +, -, @, tab, or CR is opened
    as a live formula by Excel/Sheets/LibreOffice — prefixing a leading quote
    forces it to render as inert text instead. Applied to every cell, not
    just agent_name, since a future column could add another free-text field."""
    s = str(value)
    if s and s[0] in _FORMULA_LEAD_CHARS:
        return "'" + s
    return s


def _csv_chunks(rows: list[dict], header: list[str]) -> Generator[bytes, None, None]:
    yield "﻿".encode()  # UTF-8 BOM so Excel reads the rupee glyph / non-ASCII names intact
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    yield buf.getvalue().encode("utf-8")

    for row in rows:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([_csv_cell(row.get(col, "")) for col in header])
        yield buf.getvalue().encode("utf-8")


def _export_filename(
    kind: str, business_line: str | None, date_from: date, date_to: date, extension: str = "csv"
) -> str:
    line = business_line or "all"
    return branded_filename(
        f"{kind}-{line}-{date_from.isoformat()}_{date_to.isoformat()}.{extension}"
    )


def _export_response(rows: list[dict], header: list[str], truncated: bool, filename: str):
    resp = StreamingResponse(_csv_chunks(rows, header), media_type="text/csv")
    resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    if truncated:
        resp.headers["X-Report-Truncated"] = "true"
    return resp


def _xlsx_response(rows: list[dict], header: list[str], truncated: bool, filename: str) -> Response:
    """Build a bounded XLSX file only after the request-scoped DB work ends.

    `write_string` is intentional: a string beginning with '=' or another
    spreadsheet formula prefix stays a literal string even if a future export
    column becomes user-controlled. `_csv_cell` also gives CSV/XLSX the same
    visible value for such inputs.
    """
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True, "strings_to_formulas": False})
    worksheet = workbook.add_worksheet("Report")
    workbook.set_properties({"company": "Dhanadhara", "author": "Dhanadhara"})
    worksheet.insert_image(
        "A1",
        "logo.png",
        {
            "image_data": io.BytesIO(LOGO_PNG),
            "x_scale": 0.25,
            "y_scale": 0.25,
            "description": "Dhanadhara",
        },
    )
    worksheet.write_string(
        "A4", "Dhanadhara report", workbook.add_format({"bold": True, "font_size": 14})
    )
    if truncated:
        worksheet.write_string(
            "A5", "Export limited to 50,000 rows. Narrow the filters for remaining data."
        )
    header_format = workbook.add_format(
        {"bold": True, "font_color": "#FFFFFF", "bg_color": "#172878"}
    )
    header_row = 6
    for col, value in enumerate(header):
        worksheet.write_string(header_row, col, value, header_format)
        worksheet.set_column(col, col, max(18, min(32, len(value) + 2)))
    for row_index, row in enumerate(rows, start=header_row + 1):
        for col, key in enumerate(header):
            value = row.get(key, "")
            if isinstance(value, bool):
                worksheet.write_boolean(row_index, col, value)
            elif isinstance(value, (int, float)):
                worksheet.write_number(row_index, col, value)
            else:
                worksheet.write_string(row_index, col, _csv_cell(value))
    worksheet.freeze_panes(header_row + 1, 0)
    worksheet.autofilter(header_row, 0, header_row + len(rows), len(header) - 1)
    worksheet.repeat_rows(0, header_row)
    worksheet.set_landscape()
    worksheet.fit_to_pages(1, 0)
    workbook.close()

    response = Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    if truncated:
        response.headers["X-Report-Truncated"] = "true"
    return response


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------


@router.get("/leads", response_model=LeadsReportResponse)
async def get_leads_report(
    date_from: date,
    date_to: date,
    bucket: Literal["week", "month"] = "week",
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: list[UUID] | None = Query(default=None),
    sort_by: str | None = None,
    sort_dir: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> LeadsReportResponse:
    await require_platform_admin(current_user)
    _validate_range(date_from, date_to)
    try:
        rows, total, summary = await reporting.get_leads_report(
            db,
            date_from=date_from,
            date_to=date_to,
            bucket=bucket,
            business_line=business_line,
            agent_profile_uuids=agent_profile_uuid,
            sort_by=sort_by,
            sort_dir=sort_dir,
            limit=limit,
            offset=offset,
        )
    except reporting.InvalidSortField as exc:
        raise _map_sort_error(exc) from None
    return LeadsReportResponse(
        rows=[LeadsReportRow(**r) for r in rows], total=total, summary=ReportSummary(**summary)
    )


@router.get("/leads/export")
async def export_leads_report(
    date_from: date,
    date_to: date,
    bucket: Literal["week", "month"] = "week",
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: list[UUID] | None = Query(default=None),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    await require_platform_admin(current_user)
    _validate_range(date_from, date_to)
    rows, header, truncated = await reporting.export_report_rows(
        db,
        "leads",
        reporting.ExportParams(
            date_from=date_from,
            date_to=date_to,
            bucket=bucket,
            business_line=business_line,
            agent_profile_uuids=agent_profile_uuid,
        ),
    )
    return _export_response(
        rows, header, truncated, _export_filename("leads", business_line, date_from, date_to)
    )


@router.get("/leads/export.xlsx")
async def export_leads_report_xlsx(
    date_from: date,
    date_to: date,
    bucket: Literal["week", "month"] = "week",
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: list[UUID] | None = Query(default=None),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await require_platform_admin(current_user)
    _validate_range(date_from, date_to)
    rows, header, truncated = await reporting.export_report_rows(
        db,
        "leads",
        reporting.ExportParams(
            date_from=date_from,
            date_to=date_to,
            bucket=bucket,
            business_line=business_line,
            agent_profile_uuids=agent_profile_uuid,
        ),
    )
    return _xlsx_response(
        rows,
        header,
        truncated,
        _export_filename("leads", business_line, date_from, date_to, "xlsx"),
    )


# ---------------------------------------------------------------------------
# Loans
# ---------------------------------------------------------------------------


@router.get("/loans", response_model=LoansReportResponse)
async def get_loans_report(
    date_from: date,
    date_to: date,
    bucket: Literal["week", "month"] = "week",
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: list[UUID] | None = Query(default=None),
    sort_by: str | None = None,
    sort_dir: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> LoansReportResponse:
    await require_platform_admin(current_user)
    _validate_range(date_from, date_to)
    try:
        rows, total, summary = await reporting.get_loans_report(
            db,
            date_from=date_from,
            date_to=date_to,
            bucket=bucket,
            business_line=business_line,
            agent_profile_uuids=agent_profile_uuid,
            sort_by=sort_by,
            sort_dir=sort_dir,
            limit=limit,
            offset=offset,
        )
    except reporting.InvalidSortField as exc:
        raise _map_sort_error(exc) from None
    return LoansReportResponse(
        rows=[LoansReportRow(**r) for r in rows], total=total, summary=ReportSummary(**summary)
    )


@router.get("/loans/export")
async def export_loans_report(
    date_from: date,
    date_to: date,
    bucket: Literal["week", "month"] = "week",
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: list[UUID] | None = Query(default=None),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    await require_platform_admin(current_user)
    _validate_range(date_from, date_to)
    rows, header, truncated = await reporting.export_report_rows(
        db,
        "loans",
        reporting.ExportParams(
            date_from=date_from,
            date_to=date_to,
            bucket=bucket,
            business_line=business_line,
            agent_profile_uuids=agent_profile_uuid,
        ),
    )
    return _export_response(
        rows, header, truncated, _export_filename("loans", business_line, date_from, date_to)
    )


@router.get("/loans/export.xlsx")
async def export_loans_report_xlsx(
    date_from: date,
    date_to: date,
    bucket: Literal["week", "month"] = "week",
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: list[UUID] | None = Query(default=None),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await require_platform_admin(current_user)
    _validate_range(date_from, date_to)
    rows, header, truncated = await reporting.export_report_rows(
        db,
        "loans",
        reporting.ExportParams(
            date_from=date_from,
            date_to=date_to,
            bucket=bucket,
            business_line=business_line,
            agent_profile_uuids=agent_profile_uuid,
        ),
    )
    return _xlsx_response(
        rows,
        header,
        truncated,
        _export_filename("loans", business_line, date_from, date_to, "xlsx"),
    )


# ---------------------------------------------------------------------------
# Deals
# ---------------------------------------------------------------------------


@router.get("/deals", response_model=DealsReportResponse)
async def get_deals_report(
    date_from: date,
    date_to: date,
    bucket: Literal["week", "month"] = "week",
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: list[UUID] | None = Query(default=None),
    sort_by: str | None = None,
    sort_dir: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> DealsReportResponse:
    await require_platform_admin(current_user)
    _validate_range(date_from, date_to)
    try:
        rows, total, summary = await reporting.get_deals_report(
            db,
            date_from=date_from,
            date_to=date_to,
            bucket=bucket,
            business_line=business_line,
            agent_profile_uuids=agent_profile_uuid,
            sort_by=sort_by,
            sort_dir=sort_dir,
            limit=limit,
            offset=offset,
        )
    except reporting.InvalidSortField as exc:
        raise _map_sort_error(exc) from None
    return DealsReportResponse(
        rows=[DealsReportRow(**r) for r in rows], total=total, summary=ReportSummary(**summary)
    )


@router.get("/deals/export")
async def export_deals_report(
    date_from: date,
    date_to: date,
    bucket: Literal["week", "month"] = "week",
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: list[UUID] | None = Query(default=None),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    await require_platform_admin(current_user)
    _validate_range(date_from, date_to)
    rows, header, truncated = await reporting.export_report_rows(
        db,
        "deals",
        reporting.ExportParams(
            date_from=date_from,
            date_to=date_to,
            bucket=bucket,
            business_line=business_line,
            agent_profile_uuids=agent_profile_uuid,
        ),
    )
    return _export_response(
        rows, header, truncated, _export_filename("deals", business_line, date_from, date_to)
    )


@router.get("/deals/export.xlsx")
async def export_deals_report_xlsx(
    date_from: date,
    date_to: date,
    bucket: Literal["week", "month"] = "week",
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: list[UUID] | None = Query(default=None),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await require_platform_admin(current_user)
    _validate_range(date_from, date_to)
    rows, header, truncated = await reporting.export_report_rows(
        db,
        "deals",
        reporting.ExportParams(
            date_from=date_from,
            date_to=date_to,
            bucket=bucket,
            business_line=business_line,
            agent_profile_uuids=agent_profile_uuid,
        ),
    )
    return _xlsx_response(
        rows,
        header,
        truncated,
        _export_filename("deals", business_line, date_from, date_to, "xlsx"),
    )


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------


@router.get("/agents", response_model=AgentsReportResponse)
async def get_agents_report(
    date_from: date,
    date_to: date,
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: list[UUID] | None = Query(default=None),
    sort_by: str | None = None,
    sort_dir: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> AgentsReportResponse:
    await require_platform_admin(current_user)
    _validate_range(date_from, date_to)
    try:
        rows, total, summary, team_summaries = await reporting.get_agents_report(
            db,
            date_from=date_from,
            date_to=date_to,
            business_line=business_line,
            agent_profile_uuids=agent_profile_uuid,
            sort_by=sort_by,
            sort_dir=sort_dir,
            limit=limit,
            offset=offset,
        )
    except reporting.InvalidSortField as exc:
        raise _map_sort_error(exc) from None
    return AgentsReportResponse(
        rows=[AgentsReportRow(**r) for r in rows],
        total=total,
        summary=AgentsSummary(**summary),
        team_summaries=[TeamPerformanceSummary(**r) for r in team_summaries],
    )


@router.get("/agents/export")
async def export_agents_report(
    date_from: date,
    date_to: date,
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: list[UUID] | None = Query(default=None),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    await require_platform_admin(current_user)
    _validate_range(date_from, date_to)
    rows, header, truncated = await reporting.export_report_rows(
        db,
        "agents",
        reporting.ExportParams(
            date_from=date_from,
            date_to=date_to,
            bucket="week",  # unused by the agents export; kept for a uniform ExportParams shape
            business_line=business_line,
            agent_profile_uuids=agent_profile_uuid,
        ),
    )
    return _export_response(
        rows, header, truncated, _export_filename("agents", business_line, date_from, date_to)
    )


@router.get("/agents/export.xlsx")
async def export_agents_report_xlsx(
    date_from: date,
    date_to: date,
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: list[UUID] | None = Query(default=None),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await require_platform_admin(current_user)
    _validate_range(date_from, date_to)
    rows, header, truncated = await reporting.export_report_rows(
        db,
        "agents",
        reporting.ExportParams(
            date_from=date_from,
            date_to=date_to,
            bucket="week",  # unused by the agents export; retained for uniform params
            business_line=business_line,
            agent_profile_uuids=agent_profile_uuid,
        ),
    )
    return _xlsx_response(
        rows,
        header,
        truncated,
        _export_filename("agents", business_line, date_from, date_to, "xlsx"),
    )
