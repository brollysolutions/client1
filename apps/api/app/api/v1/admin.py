"""Admin router — staff provisioning + agent-application approval queue.

Every write runs on the request session under RLS; require_platform_admin is
the access gate (see app/services/admin.py module docstring for why RLS
alone isn't enough). Tightened from the role-only `require_admin` across all
29 routes in this router (feature-status.md §2-20): every RLS admin-bypass
predicate in this codebase independently requires
`role='admin' AND platform_scope='true'` already, so this closes a gap
where a line-scoped admin got either a silent RLS-empty result or an
inconsistent 403 further down, rather than a clean 403 at the boundary —
concretely, `reject_agent_application` applies no line predicate of its
own, so a line-scoped admin could reject an application on the other
business line before this change.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_keys import RedisCache
from app.core.client_ip import get_client_ip
from app.core.deps import CurrentUser, get_cache, require_platform_admin
from app.db.session import get_db
from app.models.audit_log import AuditAction
from app.models.profile import AgentApplication, StaffRole, SubmissionStatus
from app.models.support_ticket import SupportStatus
from app.models.task import Task, TaskStatus, TaskType
from app.schemas.admin import (
    AdminAccountDeleteRequest,
    AdminAssignedLeadRead,
    AdminClientProfileRead,
    AdminEmployeeRead,
    AdminHomeResponse,
    AdminLeadRead,
    AdminLoanApplicationListResponse,
    AdminLoanApplicationRead,
    AdminPropertyDealListResponse,
    AdminPropertyDealRead,
    AdminTaskRead,
    AdminUserListResponse,
    AdminUserRead,
    AdminUserStatusUpdateRequest,
    AgentApplicationDetailRead,
    AgentApplicationDocument,
    AgentApplicationListResponse,
    AgentApplicationRead,
    AgentApproveResponse,
    AgentRejectRequest,
    StaffAccessEntry,
    StaffAccessListResponse,
    StaffCreateRequest,
    StaffCreateResponse,
    StaffFeatureUpdateRequest,
)
from app.schemas.audit_log import AuditLogListResponse, AuditLogRead
from app.schemas.auth import MessageResponse
from app.schemas.employee import TaskFeedbackMediaRead
from app.schemas.field_visibility import (
    FieldVisibilityEntryRead,
    FieldVisibilityListResponse,
    FieldVisibilityUpdateRequest,
)
from app.schemas.lead_details import AdminLeadDetailsPatch, LeadDetailsRead
from app.schemas.loan_config import (
    AdminBankListResponse,
    AdminBankRead,
    AdminLoanTypeListResponse,
    AdminLoanTypeRead,
    BankAvailabilityEntry,
    BankAvailabilityMatrixResponse,
    BankAvailabilitySet,
    BankCreate,
    BankUpdate,
    LoanTypeCreate,
    LoanTypeUpdate,
)
from app.schemas.loans import LoanApplicationProgressUpdate
from app.schemas.property_deals import PropertyDealProgressUpdate
from app.schemas.support_tickets import (
    SupportTicketAdminListResponse,
    SupportTicketAdminRead,
    SupportTicketAdvanceRequest,
)
from app.services import storage
from app.services.account_deletion import (
    AccountAlreadyDeleted,
    AccountNotFound,
    PrimaryAdminDeletionForbidden,
    delete_account,
)
from app.services.admin import (
    ADDITIONAL_ADMIN_LIMIT,
    AdditionalAdminLimitReached,
    AdminUserNotFound,
    AdminUserUpdateForbidden,
    AgentApplicationAlreadyReviewed,
    AgentApplicationEmailConflict,
    InvalidStaffFeatureTarget,
    PrimaryAdminRequired,
    StaffAlreadyExists,
    approve_agent_application,
    create_staff,
    is_primary_admin,
    list_operational_users,
    list_staff_access,
    operational_client_profiles_for,
    operational_email_for,
    operational_mobile_for,
    operational_roles_for,
    reject_agent_application,
    set_operational_user_status,
    set_staff_feature,
)
from app.services.admin_home import get_admin_home
from app.services.audit_log import AuditEntryView
from app.services.audit_log import list_for_admin as list_audit_log
from app.services.field_visibility import (
    FieldVisibilityModeNotAllowed,
    UnknownFieldVisibilityKey,
)
from app.services.field_visibility import (
    list_for_admin as list_field_visibility,
)
from app.services.field_visibility import (
    update_for_admin as update_field_visibility,
)
from app.services.lead_details import (
    DetailActor,
    LeadDetailsLocked,
    LeadDetailsNotFound,
)
from app.services.lead_details import (
    get_for_actor as get_lead_details_for_actor,
)
from app.services.lead_details import (
    patch_details as patch_owned_lead_details,
)
from app.services.lead_details import (
    to_read as to_lead_details_read,
)
from app.services.leads import list_assigned_leads, list_unassigned_leads
from app.services.loan_applications import (
    BankNotAvailableForLoanType,
    StatusReasonRequired,
    TerminalApplication,
    TermsNotAllowedAtStage,
    UnknownBank,
    apply_progress_update,
    get_application_for_admin,
    list_applications_for_admin,
)
from app.services.loan_applications import InvalidStatusTransition as InvalidLoanStatusTransition
from app.services.loan_config import (
    BankNotFound,
    DuplicateBankName,
    DuplicateLoanTypeName,
    LoanTypeNotFound,
    bank_application_counts,
    create_bank,
    create_loan_type,
    list_availability_entries,
    list_banks,
    list_loan_types,
    loan_type_application_counts,
    set_bank_availability,
    update_bank,
    update_loan_type,
)
from app.services.property_deals import InvalidStatusTransition as InvalidDealStatusTransition
from app.services.property_deals import (
    StatusReasonRequired as DealStatusReasonRequired,
)
from app.services.property_deals import (
    TerminalDeal,
    UnknownSiteVisit,
    get_deal_for_admin,
    list_deals_for_admin,
)
from app.services.property_deals import (
    TermsNotAllowedAtStage as DealTermsNotAllowedAtStage,
)
from app.services.property_deals import (
    apply_progress_update as apply_deal_progress_update,
)
from app.services.support_tickets import (
    AdminTicketView,
    TicketIllegalTransition,
    TicketManagedWorkflow,
    TicketNotFound,
    advance_ticket,
)
from app.services.support_tickets import (
    list_for_admin as list_support_tickets_for_admin,
)
from app.services.support_tickets import (
    view_for_admin as view_support_ticket_for_admin,
)
from app.services.task_feedback import list_feedback_media
from app.services.tasks import list_active_employees, list_tasks_for_admin

router = APIRouter()


def _to_field_visibility_read(definition, override) -> FieldVisibilityEntryRead:  # noqa: ANN001
    return FieldVisibilityEntryRead(
        id=override.id if override is not None else None,
        target_role=definition.target_role,
        entity=definition.entity,
        field_key=definition.field_key,
        label=definition.label,
        mode=override.mode if override is not None else definition.default_mode,
        default_mode=definition.default_mode,
        allowed_modes=list(definition.allowed_modes),
        locked=definition.locked,
        lock_reason=definition.lock_reason,
        updated_at=override.updated_at if override is not None else None,
    )


@router.get("/field-visibility", response_model=FieldVisibilityListResponse)
async def get_field_visibility(
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> FieldVisibilityListResponse:
    del current_user
    rows = await list_field_visibility(db)
    return FieldVisibilityListResponse(
        entries=[_to_field_visibility_read(definition, override) for definition, override in rows]
    )


@router.put("/field-visibility", response_model=FieldVisibilityEntryRead)
async def set_field_visibility(
    payload: FieldVisibilityUpdateRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> FieldVisibilityEntryRead:
    try:
        config = await update_field_visibility(
            db,
            target_role=payload.target_role,
            entity=payload.entity,
            field_key=payload.field_key,
            mode=payload.mode,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
        )
    except UnknownFieldVisibilityKey as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "This field is not part of the supported visibility catalogue.",
        ) from exc
    except FieldVisibilityModeNotAllowed as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This visibility mode is not allowed for the selected field.",
        ) from exc

    rows = await list_field_visibility(db)
    for definition, override in rows:
        if (
            definition.target_role == config.target_role
            and definition.entity == config.entity
            and definition.field_key == config.field_key
        ):
            return _to_field_visibility_read(definition, override)
    raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Visibility catalogue mismatch.")


@router.get("/home", response_model=AdminHomeResponse)
async def home(
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminHomeResponse:
    del current_user  # gate only; every query below is platform-wide, not own-scoped
    return await get_admin_home(db)


def _to_admin_loan_application_read(application) -> AdminLoanApplicationRead:  # noqa: ANN001
    return AdminLoanApplicationRead(
        id=application.id,
        lead_uuid=application.lead_uuid,
        customer_code=application.client_profile.customer_code,
        loan_type_id=application.loan_type_id,
        loan_type_label=application.loan_type.label,
        bank_id=application.bank_id,
        bank_name=application.bank.name if application.bank else None,
        business_line=application.business_line,
        status=application.status,
        status_reason=application.status_reason,
        amount_requested=application.amount_requested,
        amount_sanctioned=application.amount_sanctioned,
        interest_rate=application.interest_rate,
        processing_fee=application.processing_fee,
        fee_outcome=application.fee_outcome,
        opened_at=application.opened_at,
        closed_at=application.closed_at,
    )


def _to_admin_property_deal_read(deal) -> AdminPropertyDealRead:  # noqa: ANN001
    return AdminPropertyDealRead(
        id=deal.id,
        lead_uuid=deal.lead_uuid,
        customer_code=deal.client_profile.customer_code,
        property_title=deal.property.title,
        business_line=deal.business_line,
        status=deal.status,
        status_reason=deal.status_reason,
        price_quoted=deal.price_quoted,
        booking_amount=deal.booking_amount,
        site_visit_uuid=deal.site_visit_uuid,
        opened_at=deal.opened_at,
        closed_at=deal.closed_at,
    )


@router.post(
    "/users/create", response_model=StaffCreateResponse, status_code=status.HTTP_201_CREATED
)
async def create_staff_user(
    payload: StaffCreateRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> StaffCreateResponse:
    try:
        profile, temp_password = await create_staff(
            db,
            current_user.id,
            payload,
            actor_role=current_user.role,
            actor_staff_profile_uuid=current_user.staff_profile_uuid,
        )
    except StaffAlreadyExists as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This mobile number already has an active staff account.",
        ) from exc
    except PrimaryAdminRequired as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the Main Admin may create another Admin account.",
        ) from exc
    except AdditionalAdminLimitReached as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The limit of three additional Admin accounts has been reached.",
        ) from exc
    return StaffCreateResponse(
        first_name=payload.first_name,
        last_name=payload.last_name,
        mobile=payload.mobile,
        role=payload.role,
        business_line=profile.business_line,
        staff_code=profile.staff_code,
        temp_password=temp_password,
    )


@router.get("/staff-access", response_model=StaffAccessListResponse)
async def get_staff_access(
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> StaffAccessListResponse:
    if not await is_primary_admin(
        db,
        auth_user_uuid=current_user.id,
        staff_profile_uuid=current_user.staff_profile_uuid,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the Main Admin may manage staff feature access.",
        )
    entries, additional_count = await list_staff_access(db)
    return StaffAccessListResponse(
        entries=[StaffAccessEntry(**entry) for entry in entries],
        additional_admin_limit=ADDITIONAL_ADMIN_LIMIT,
        additional_admin_count=additional_count,
    )


@router.put(
    "/staff-access/{staff_profile_uuid}/features",
    response_model=StaffAccessListResponse,
)
async def update_staff_feature(
    staff_profile_uuid: UUID,
    payload: StaffFeatureUpdateRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> StaffAccessListResponse:
    try:
        await set_staff_feature(
            db,
            actor_uuid=current_user.id,
            actor_staff_profile_uuid=current_user.staff_profile_uuid,
            target_staff_profile_uuid=staff_profile_uuid,
            feature=payload.feature,
            enabled=payload.enabled,
            actor_role=current_user.role,
        )
    except PrimaryAdminRequired as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the Main Admin may manage staff feature access.",
        ) from exc
    except InvalidStaffFeatureTarget as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Feature grants may target only an active Sub Admin.",
        ) from exc

    entries, additional_count = await list_staff_access(db)
    return StaffAccessListResponse(
        entries=[StaffAccessEntry(**entry) for entry in entries],
        additional_admin_limit=ADDITIONAL_ADMIN_LIMIT,
        additional_admin_count=additional_count,
    )


@router.post("/users/{auth_user_uuid}/delete", response_model=MessageResponse)
async def delete_user(
    auth_user_uuid: UUID,
    payload: AdminAccountDeleteRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
) -> MessageResponse:
    """FR-17.4 — Admin removal of a suspicious account. Admin-only (not Sub
    Admin): mirrors the require_platform_admin wall on the other irreversible
    platform-identity actions above (staff provisioning, agent-app review)."""
    if auth_user_uuid == current_user.id:
        # This path never blacklists the caller's own current access token
        # (actor_jti is always None here) — self-deletion belongs to
        # DELETE /auth/me, which does. Rejecting outright avoids a soft-deleted
        # Admin whose live token keeps working for the rest of its TTL.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use account settings to delete your own account.",
        )
    try:
        await delete_account(
            db,
            cache,
            target_auth_user_uuid=auth_user_uuid,
            actor_auth_user_uuid=current_user.id,
            actor_jti=None,
            actor_access_token_exp=None,
            reason=payload.reason,
            ip=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
            actor_role=current_user.role,
        )
    except AccountNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found."
        ) from exc
    except AccountAlreadyDeleted as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account has already been deleted.",
        ) from exc
    except PrimaryAdminDeletionForbidden as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The Main Admin cannot be deleted without an explicit ownership transfer.",
        ) from exc
    return MessageResponse(message="Account deleted.")


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    response: Response,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(require_platform_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminUserListResponse:
    response.headers["Cache-Control"] = "private, no-store"
    users, total = await list_operational_users(db, limit=limit, offset=offset)
    return AdminUserListResponse(
        users=[
            AdminUserRead(
                id=user.id,
                first_name=user.first_name,
                last_name=user.last_name,
                mobile=operational_mobile_for(user),
                email=operational_email_for(user),
                status=user.status.value,
                roles=roles,
                client_profiles=[
                    AdminClientProfileRead.model_validate(profile, from_attributes=True)
                    for profile in client_profiles
                ],
                created_at=user.created_at,
                last_login_at=user.last_login_at,
            )
            for user, roles, client_profiles in users
        ],
        total=total,
    )


@router.patch("/users/{auth_user_uuid}/status", response_model=AdminUserRead)
async def update_user_status(
    auth_user_uuid: UUID,
    payload: AdminUserStatusUpdateRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserRead:
    from app.models.user import UserStatus

    try:
        user = await set_operational_user_status(
            db,
            target_user_uuid=auth_user_uuid,
            target_status=UserStatus(payload.status),
            reason=payload.reason,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
        )
    except AdminUserNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found."
        ) from exc
    except AdminUserUpdateForbidden as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account cannot be updated through the Admin status control.",
        ) from exc
    roles = await operational_roles_for(db, user.id)
    client_profiles = await operational_client_profiles_for(db, user.id)
    return AdminUserRead(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        mobile=operational_mobile_for(user),
        email=operational_email_for(user),
        status=user.status.value,
        roles=roles,
        client_profiles=[
            AdminClientProfileRead.model_validate(profile, from_attributes=True)
            for profile in client_profiles
        ],
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


@router.get("/agents", response_model=AgentApplicationListResponse)
async def list_pending_agent_applications(
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentApplicationListResponse:
    rows = (
        await db.scalars(
            select(AgentApplication)
            .where(AgentApplication.status == SubmissionStatus.PENDING)
            .order_by(AgentApplication.created_at.desc())
        )
    ).all()
    return AgentApplicationListResponse(
        applications=[AgentApplicationRead.model_validate(r, from_attributes=True) for r in rows]
    )


@router.get("/agents/{application_id}", response_model=AgentApplicationDetailRead)
async def get_agent_application(
    application_id: UUID,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentApplicationDetailRead:
    """Detail view, not fields on the list: presign_download URLs are 5-minute
    signed links, so minting them at list time would leave most of them dead
    before an admin finishes scrolling. Fetched on dialog-open instead."""
    application = await db.scalar(
        select(AgentApplication).where(AgentApplication.id == application_id)
    )
    if application is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    doc_refs: list[tuple[str, str | None]] = [
        ("aadhaar_front", application.aadhaar_ref),
        ("aadhaar_back", application.aadhaar_back_ref),
        ("pan", application.pan_ref),
        ("photo", application.photo_ref),
    ]
    documents = [
        AgentApplicationDocument(doc_type=doc_type, download_url=storage.presign_download(ref))
        for doc_type, ref in doc_refs
        if ref is not None
    ]
    return AgentApplicationDetailRead(
        **AgentApplicationRead.model_validate(application, from_attributes=True).model_dump(),
        documents=documents,
        review_note=application.review_note,
    )


@router.post("/agents/{application_id}/approve", response_model=AgentApproveResponse)
async def approve_agent(
    application_id: UUID,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentApproveResponse:
    try:
        result = await approve_agent_application(
            db,
            application_id,
            current_user.staff_profile_uuid,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
        )
    except AgentApplicationAlreadyReviewed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This application has already been reviewed.",
        ) from exc
    except AgentApplicationEmailConflict as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This email already belongs to another account. Ask the applicant "
                "to apply again with a different email."
            ),
        ) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    profile, temp_password = result
    return AgentApproveResponse(
        agent_code=profile.agent_code,
        business_line=profile.business_line,
        temp_password=temp_password,
    )


@router.post("/agents/{application_id}/reject", response_model=AgentApplicationRead)
async def reject_agent(
    application_id: UUID,
    payload: AgentRejectRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentApplicationRead:
    try:
        ok = await reject_agent_application(
            db,
            application_id,
            current_user.staff_profile_uuid,
            payload.note,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
        )
    except AgentApplicationAlreadyReviewed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This application has already been reviewed.",
        ) from exc
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    application = await db.scalar(
        select(AgentApplication).where(AgentApplication.id == application_id)
    )
    if application is None:  # pragma: no cover — admin RLS always sees the row it just rejected
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    return AgentApplicationRead.model_validate(application, from_attributes=True)


@router.get("/employees", response_model=list[AdminEmployeeRead])
async def list_employees(
    business_line: str | None = None,
    role: Literal["employee", "telecaller"] | None = None,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AdminEmployeeRead]:
    rows = await list_active_employees(
        db, business_line, StaffRole(role) if role else StaffRole.EMPLOYEE
    )
    return [
        AdminEmployeeRead(
            id=profile.id,
            staff_code=profile.staff_code,
            business_line=profile.business_line,
            first_name=user.first_name,
            last_name=user.last_name,
        )
        for profile, user in rows
    ]


@router.get("/leads", response_model=list[AdminLeadRead])
async def list_leads(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AdminLeadRead]:
    leads = await list_unassigned_leads(db, limit, offset)
    return [AdminLeadRead.model_validate(lead, from_attributes=True) for lead in leads]


@router.get("/leads/assigned", response_model=list[AdminAssignedLeadRead])
async def list_assigned(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AdminAssignedLeadRead]:
    rows = await list_assigned_leads(db, limit, offset)
    return [
        AdminAssignedLeadRead(
            id=lead.id,
            name=lead.name,
            mobile=lead.mobile,
            business_line=lead.business_line,
            origin=lead.origin,
            status=lead.status,
            assigned_telecaller_staff_profile_uuid=staff.id if staff else None,
            assigned_telecaller_name=(
                f"{user.first_name} {user.last_name}" if user is not None else None
            ),
            assigned_telecaller_staff_code=staff.staff_code if staff else None,
            created_at=lead.created_at,
            updated_at=lead.updated_at,
        )
        for lead, staff, user in rows
    ]


@router.get("/leads/{lead_id}/details", response_model=LeadDetailsRead)
async def get_lead_details(
    lead_id: UUID,
    response: Response,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> LeadDetailsRead:
    response.headers["Cache-Control"] = "private, no-store"
    actor = DetailActor(role="admin", subject_uuid=current_user.id, auth_user_uuid=current_user.id)
    try:
        lead = await get_lead_details_for_actor(db, lead_id, actor)
    except LeadDetailsNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found.") from exc
    return to_lead_details_read(lead, actor)


@router.patch("/leads/{lead_id}/details", response_model=LeadDetailsRead)
async def update_lead_details(
    lead_id: UUID,
    payload: AdminLeadDetailsPatch,
    response: Response,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> LeadDetailsRead:
    response.headers["Cache-Control"] = "private, no-store"
    actor = DetailActor(role="admin", subject_uuid=current_user.id, auth_user_uuid=current_user.id)
    try:
        lead = await get_lead_details_for_actor(db, lead_id, actor)
    except LeadDetailsNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found.") from exc
    try:
        lead = await patch_owned_lead_details(
            db,
            lead=lead,
            payload=payload,
            actor=actor,
            admin_reason=payload.reason,
        )
    except LeadDetailsLocked as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Lead details changed concurrently; reload and try again.",
        ) from exc
    return to_lead_details_read(lead, actor)


@router.get("/tasks", response_model=list[AdminTaskRead])
async def list_tasks(
    status_filter: TaskStatus | None = None,
    task_type_filter: TaskType | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AdminTaskRead]:
    tasks = await list_tasks_for_admin(
        db,
        status_filter,
        task_type_filter,
        limit=limit,
    )
    return [
        AdminTaskRead(
            id=view.task.id,
            lead_uuid=view.task.lead_uuid,
            raised_by_staff_profile_uuid=view.task.raised_by_staff_profile_uuid,
            assigned_employee_profile_uuid=view.task.assigned_employee_profile_uuid,
            lead_name=view.lead_name,
            lead_mobile=view.lead_mobile,
            raised_by_telecaller_name=view.raised_by_telecaller_name,
            assigned_employee_name=view.assigned_employee_name,
            business_line=view.task.business_line,
            task_type=view.task.task_type,
            status=view.task.status,
            outcome=view.task.outcome,
            notes=view.task.notes,
            due_at=view.task.due_at,
            created_at=view.task.created_at,
            updated_at=view.task.updated_at,
        )
        for view in tasks
    ]


@router.get(
    "/tasks/{task_id}/feedback-media",
    response_model=list[TaskFeedbackMediaRead],
)
async def list_task_feedback_for_admin(
    task_id: UUID,
    response: Response,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> list[TaskFeedbackMediaRead]:
    del current_user
    response.headers["Cache-Control"] = "private, no-store"
    task = await db.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    return [
        TaskFeedbackMediaRead(
            id=item.id,
            kind=item.kind,
            content_type=item.content_type,
            size_bytes=item.size_bytes,
            created_at=item.created_at,
            preview_url=(
                storage.presign_preview(item.object_key) if item.kind == "image" else None
            ),
            download_url=storage.presign_download(item.object_key),
        )
        for item in await list_feedback_media(db, task_id)
    ]


@router.get("/loans", response_model=AdminLoanApplicationListResponse)
async def list_loan_applications(
    status_filter: str | None = None,
    current_user: CurrentUser = Depends(require_platform_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminLoanApplicationListResponse:
    applications = await list_applications_for_admin(db, status_filter)
    return AdminLoanApplicationListResponse(
        applications=[_to_admin_loan_application_read(a) for a in applications]
    )


@router.patch("/loan-applications/{application_id}", response_model=AdminLoanApplicationRead)
async def update_loan_application_progress(
    application_id: UUID,
    payload: LoanApplicationProgressUpdate,
    current_user: CurrentUser = Depends(require_platform_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminLoanApplicationRead:
    application = await get_application_for_admin(db, application_id)
    if application is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan application not found.")

    try:
        application = await apply_progress_update(db, application, payload)
    except TerminalApplication as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This application is already closed."
        ) from exc
    except InvalidLoanStatusTransition as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That status change is not allowed from the current status."
        ) from exc
    except StatusReasonRequired as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A reason is required when moving to rejected or on hold.",
        ) from exc
    except TermsNotAllowedAtStage as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Deal terms can only be set once the application has been submitted to a bank.",
        ) from exc
    except UnknownBank as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown or inactive bank."
        ) from exc
    except BankNotAvailableForLoanType as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "This bank does not offer that loan type."
        ) from exc

    application = await get_application_for_admin(db, application_id)
    assert application is not None  # just updated it above
    return _to_admin_loan_application_read(application)


@router.get("/property-deals", response_model=AdminPropertyDealListResponse)
async def list_property_deals(
    status_filter: str | None = None,
    current_user: CurrentUser = Depends(require_platform_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminPropertyDealListResponse:
    deals = await list_deals_for_admin(db, status_filter)
    return AdminPropertyDealListResponse(deals=[_to_admin_property_deal_read(d) for d in deals])


@router.patch("/property-deals/{deal_id}", response_model=AdminPropertyDealRead)
async def update_property_deal_progress(
    deal_id: UUID,
    payload: PropertyDealProgressUpdate,
    current_user: CurrentUser = Depends(require_platform_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminPropertyDealRead:
    deal = await get_deal_for_admin(db, deal_id)
    if deal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Property deal not found.")

    try:
        deal = await apply_deal_progress_update(db, deal, payload)
    except TerminalDeal as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "This deal is already closed.") from exc
    except InvalidDealStatusTransition as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That status change is not allowed from the current status."
        ) from exc
    except DealStatusReasonRequired as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A reason is required when moving to rejected or on hold.",
        ) from exc
    except DealTermsNotAllowedAtStage as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Deal terms can only be set once the deal has been booked.",
        ) from exc
    except UnknownSiteVisit as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown site visit for this client."
        ) from exc

    deal = await get_deal_for_admin(db, deal_id)
    assert deal is not None  # just updated it above
    return _to_admin_property_deal_read(deal)


def _to_support_ticket_admin_read(view: AdminTicketView) -> SupportTicketAdminRead:
    t = view.ticket
    return SupportTicketAdminRead(
        id=t.id,
        category=t.category,
        subject=t.subject,
        body=t.body,
        status=t.status,
        resolution_note=t.resolution_note,
        created_at=t.created_at,
        updated_at=t.updated_at,
        requester_name=view.requester_name,
        requester_mobile=view.requester_mobile,
    )


@router.get("/support-tickets", response_model=SupportTicketAdminListResponse)
async def list_support_tickets(
    status_filter: SupportStatus | None = Query(default=None, alias="status"),
    current_user: CurrentUser = Depends(require_platform_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> SupportTicketAdminListResponse:
    views = await list_support_tickets_for_admin(db, status_filter=status_filter)
    return SupportTicketAdminListResponse(tickets=[_to_support_ticket_admin_read(v) for v in views])


@router.patch("/support-tickets/{ticket_id}", response_model=SupportTicketAdminRead)
async def advance_support_ticket(
    ticket_id: UUID,
    payload: SupportTicketAdvanceRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> SupportTicketAdminRead:
    try:
        ticket = await advance_ticket(
            db,
            ticket_id,
            target_status=payload.status,
            resolution_note=payload.resolution_note,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
        )
    except TicketNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Support ticket not found.") from exc
    except TicketIllegalTransition as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That status change is not allowed from the current status."
        ) from exc
    except TicketManagedWorkflow as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Use the mobile-change review workflow for this recovery ticket.",
        ) from exc

    view = await view_support_ticket_for_admin(db, ticket)
    return _to_support_ticket_admin_read(view)


def _to_audit_log_read(view: AuditEntryView) -> AuditLogRead:
    e = view.entry
    return AuditLogRead(
        id=e.id,
        actor_uuid=e.actor_uuid,
        actor_name=view.actor_name,
        actor_role=e.actor_role,
        action=e.action,
        entity_type=e.entity_type,
        entity_uuid=e.entity_uuid,
        business_line=e.business_line,
        detail=e.detail,
        created_at=e.created_at,
    )


@router.get("/audit-log", response_model=AuditLogListResponse)
async def list_audit_entries(
    action: AuditAction | None = Query(default=None),
    actor_uuid: UUID | None = Query(default=None),
    entity_type: str | None = Query(default=None, max_length=64),
    entity_uuid: UUID | None = Query(default=None),
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(require_platform_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    """Read-only activity feed (Admin design §5.6). Admin-only twice over: this
    guard, and `audit_log_select` in the database, which no other role satisfies.

    There is deliberately no POST/PATCH/DELETE counterpart anywhere in the API —
    the table grants `api_user` only SELECT/INSERT, and the INSERT path belongs to
    the services that perform audited actions, not to a caller.
    """
    views, total = await list_audit_log(
        db,
        action=action,
        actor_uuid=actor_uuid,
        entity_type=entity_type,
        entity_uuid=entity_uuid,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )
    return AuditLogListResponse(entries=[_to_audit_log_read(v) for v in views], total=total)


# ---------------------------------------------------------------------------
# Loan config — loan types, banks, per-bank availability (FR-6.3/FR-6.4)
# ---------------------------------------------------------------------------


def _to_admin_loan_type_read(loan_type, count: int) -> AdminLoanTypeRead:  # noqa: ANN001
    return AdminLoanTypeRead(
        id=loan_type.id,
        name=loan_type.name,
        label=loan_type.label,
        active=loan_type.active,
        custom_fields=loan_type.custom_fields,
        created_at=loan_type.created_at,
        updated_at=loan_type.updated_at,
        application_count=count,
    )


def _to_admin_bank_read(bank, count: int) -> AdminBankRead:  # noqa: ANN001
    return AdminBankRead(
        id=bank.id,
        name=bank.name,
        logo_key=bank.logo_key,
        active=bank.active,
        created_at=bank.created_at,
        updated_at=bank.updated_at,
        application_count=count,
    )


@router.get("/loan-types", response_model=AdminLoanTypeListResponse)
async def list_admin_loan_types(
    current_user: CurrentUser = Depends(require_platform_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminLoanTypeListResponse:
    loan_types = await list_loan_types(db)
    counts = await loan_type_application_counts(db)
    return AdminLoanTypeListResponse(
        loan_types=[_to_admin_loan_type_read(lt, counts.get(lt.id, 0)) for lt in loan_types]
    )


@router.post("/loan-types", response_model=AdminLoanTypeRead, status_code=status.HTTP_201_CREATED)
async def create_admin_loan_type(
    payload: LoanTypeCreate,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminLoanTypeRead:
    try:
        loan_type = await create_loan_type(
            db, payload, actor_uuid=current_user.id, actor_role=current_user.role
        )
    except DuplicateLoanTypeName as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A loan type with an equivalent name already exists."
        ) from exc
    return _to_admin_loan_type_read(loan_type, 0)


@router.patch("/loan-types/{loan_type_id}", response_model=AdminLoanTypeRead)
async def update_admin_loan_type(
    loan_type_id: UUID,
    payload: LoanTypeUpdate,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminLoanTypeRead:
    try:
        loan_type = await update_loan_type(
            db, loan_type_id, payload, actor_uuid=current_user.id, actor_role=current_user.role
        )
    except LoanTypeNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan type not found.") from exc
    counts = await loan_type_application_counts(db)
    return _to_admin_loan_type_read(loan_type, counts.get(loan_type.id, 0))


@router.get("/banks", response_model=AdminBankListResponse)
async def list_admin_banks(
    current_user: CurrentUser = Depends(require_platform_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminBankListResponse:
    banks = await list_banks(db)
    counts = await bank_application_counts(db)
    return AdminBankListResponse(banks=[_to_admin_bank_read(b, counts.get(b.id, 0)) for b in banks])


@router.post("/banks", response_model=AdminBankRead, status_code=status.HTTP_201_CREATED)
async def create_admin_bank(
    payload: BankCreate,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminBankRead:
    try:
        bank = await create_bank(
            db, payload, actor_uuid=current_user.id, actor_role=current_user.role
        )
    except DuplicateBankName as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A bank with an equivalent name already exists."
        ) from exc
    return _to_admin_bank_read(bank, 0)


@router.patch("/banks/{bank_id}", response_model=AdminBankRead)
async def update_admin_bank(
    bank_id: UUID,
    payload: BankUpdate,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminBankRead:
    try:
        bank = await update_bank(
            db, bank_id, payload, actor_uuid=current_user.id, actor_role=current_user.role
        )
    except BankNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bank not found.") from exc
    except DuplicateBankName as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A bank with an equivalent name already exists."
        ) from exc
    counts = await bank_application_counts(db)
    return _to_admin_bank_read(bank, counts.get(bank.id, 0))


async def _availability_matrix(db: AsyncSession) -> BankAvailabilityMatrixResponse:
    loan_types = await list_loan_types(db)
    banks = await list_banks(db)
    lt_counts = await loan_type_application_counts(db)
    bank_counts = await bank_application_counts(db)
    entries = await list_availability_entries(db)
    return BankAvailabilityMatrixResponse(
        banks=[_to_admin_bank_read(b, bank_counts.get(b.id, 0)) for b in banks],
        loan_types=[_to_admin_loan_type_read(lt, lt_counts.get(lt.id, 0)) for lt in loan_types],
        entries=[
            BankAvailabilityEntry(
                bank_id=e.bank_id, loan_type_id=e.loan_type_id, available=e.available
            )
            for e in entries
        ],
    )


@router.get("/bank-availability", response_model=BankAvailabilityMatrixResponse)
async def get_bank_availability_matrix(
    current_user: CurrentUser = Depends(require_platform_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> BankAvailabilityMatrixResponse:
    return await _availability_matrix(db)


@router.put("/banks/{bank_id}/availability", response_model=BankAvailabilityMatrixResponse)
async def set_admin_bank_availability(
    bank_id: UUID,
    payload: BankAvailabilitySet,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> BankAvailabilityMatrixResponse:
    try:
        await set_bank_availability(
            db,
            bank_id,
            payload.entries,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
        )
    except BankNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bank not found.") from exc
    except LoanTypeNotFound as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "One or more loan types in the request were not found."
        ) from exc
    return await _availability_matrix(db)
