"""Client property enquiries — raise an enquiry and list own.

Real-estate line. RLS (migration 4d5e6f7a8b9c) is the access boundary: a
client sees only their own enquiries; real-estate telecaller/employee/
sub_admin/agent see all real-estate-line enquiries; platform Admin/Sub Admin
see all. The client never supplies user_uuid/business_line/status — the
router stamps user_uuid from the authenticated identity and business_line as
a literal "real_estate" (this table exists for the real-estate line only).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.models.enquiry import Enquiry
from app.schemas.enquiries import EnquiryCreate, EnquiryListResponse, EnquiryRead
from app.services.leads import ensure_client_line_lead_for_user

router = APIRouter()


def _require_client(current_user: CurrentUser) -> None:
    # Raising an enquiry is client self-service only. RLS's staff/agent branch
    # exists for read visibility (list), not for staff to act as the owner of
    # someone else's enquiry.
    if current_user.role != "client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clients can raise a property enquiry.",
        )


@router.get("", response_model=EnquiryListResponse)
async def list_enquiries(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> EnquiryListResponse:
    result = await db.execute(select(Enquiry).order_by(Enquiry.created_at.desc()))
    enquiries = result.scalars().all()
    return EnquiryListResponse(
        enquiries=[EnquiryRead.model_validate(e, from_attributes=True) for e in enquiries]
    )


@router.post("", response_model=EnquiryRead, status_code=status.HTTP_201_CREATED)
async def create_enquiry(
    req: EnquiryCreate,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> EnquiryRead:
    _require_client(current_user)
    try:
        await ensure_client_line_lead_for_user(
            auth_user_uuid=current_user.id,
            mobile=current_user.mobile,
            business_line="real_estate",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your Real Estate Client profile is not available.",
        ) from exc
    enquiry = Enquiry(
        user_uuid=current_user.id,
        business_line="real_estate",
        property_ref=req.property_ref,
        title=req.title,
        locality=req.locality,
        city=req.city,
        contact_name=req.contact_name,
        contact_mobile=req.contact_mobile,
        message=req.message,
    )
    db.add(enquiry)
    await db.commit()
    await db.refresh(enquiry)
    return EnquiryRead.model_validate(enquiry, from_attributes=True)
