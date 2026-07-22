"""Submission review — approve/reject on a bypass superuser session.

Runs on its OWN AsyncSessionLocal session as the 'app' superuser (bypasses RLS),
the same mechanism as services.notifications.emit_notification. Approval creates a
live Property from the submission payload AND flips the submission to `approved`
in one transaction, so the catalog's SELECT-only api_user grant is untouched and
the mutation never rides the reviewer's request transaction. Access control is the
router's require_re_reviewer guard (RLS wouldn't gate a superuser session).
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from app.db.session import AsyncSessionLocal
from app.models.property import Property
from app.models.property_submission import PropertySubmission, SubmissionStatus


class SubmissionAlreadyReviewed(Exception):
    """Raised when approve/reject targets a row that is no longer pending."""


def format_inr_display(paise: int) -> str:
    """Derive the catalog display string from integer paise. >= 1 Cr -> 'Cr',
    else 'L'. Trims trailing zeros: 78_00_000_00 paise -> '₹78 L'."""
    rupees = paise // 100
    if rupees >= 10_000_000:  # >= 1 crore
        value = rupees / 10_000_000
        unit = "Cr"
    else:
        value = rupees / 100_000
        unit = "L"
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return f"₹{text} {unit}"


async def approve_submission(submission_id: UUID, reviewer_uuid: UUID) -> UUID | None:
    async with AsyncSessionLocal() as session:
        sub = await session.get(PropertySubmission, submission_id)
        if sub is None:
            return None
        if sub.status != SubmissionStatus.PENDING:
            raise SubmissionAlreadyReviewed
        prop = Property(
            business_line="real_estate",
            active=True,
            title=sub.title,
            type=sub.type,
            location=sub.location,
            price_display=format_inr_display(sub.price_paise),
            meta=sub.meta,
            image=sub.image,
            category=sub.category,
            city=sub.city,
            locality=sub.locality,
            pincode=sub.pincode,
            price_paise=sub.price_paise,
            bhk=sub.bhk,
            area_sqft=sub.area_sqft,
            furnishing=sub.furnishing,
            construction_status=sub.construction_status,
            amenities=list(sub.amenities),
            age_years=sub.age_years,
            rera_number=sub.rera_number,
            details=dict(sub.details),
        )
        session.add(prop)
        await session.flush()
        sub.status = SubmissionStatus.APPROVED
        sub.reviewed_by_uuid = reviewer_uuid
        sub.reviewed_at = datetime.now(UTC)
        sub.approved_property_id = prop.id
        await session.commit()
        return prop.id


async def reject_submission(submission_id: UUID, reviewer_uuid: UUID, note: str) -> bool:
    async with AsyncSessionLocal() as session:
        sub = await session.get(PropertySubmission, submission_id)
        if sub is None:
            return False
        if sub.status != SubmissionStatus.PENDING:
            raise SubmissionAlreadyReviewed
        sub.status = SubmissionStatus.REJECTED
        sub.review_note = note
        sub.reviewed_by_uuid = reviewer_uuid
        sub.reviewed_at = datetime.now(UTC)
        await session.commit()
        return True
