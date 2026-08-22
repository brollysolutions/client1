"""Financial-product form publication and client submission services."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loan import (
    Bank,
    FinancialProductProviderOffer,
    FinancialServiceEnquiry,
    LoanApplication,
    LoanType,
)
from app.schemas.financial_products import (
    FormAnswers,
    FormAnswersValidationError,
    FormFieldDefinition,
    FormInputType,
    FormOption,
    FormSectionDefinition,
    ProductCategory,
    ProductFormDefinition,
    ensure_category_form,
    validate_form_answers,
)
from app.services.leads import resolve_loans_lead


class FinancialProductError(Exception):
    pass


class ProductNotFound(FinancialProductError):
    pass


class WrongProductCategory(FinancialProductError):
    pass


class StaleFormVersion(FinancialProductError):
    pass


class InvalidFormAnswers(FinancialProductError):
    pass


class ActiveLoanApplicationExists(FinancialProductError):
    pass


class ProviderOfferUnavailable(FinancialProductError):
    pass


async def _provider_offer_preference(
    db: AsyncSession,
    *,
    product: LoanType,
    provider_offer_id: UUID | None,
) -> tuple[UUID | None, dict[str, object] | None]:
    if provider_offer_id is None:
        return None, None
    row = (
        await db.execute(
            select(FinancialProductProviderOffer, Bank)
            .join(Bank, Bank.id == FinancialProductProviderOffer.bank_id)
            .where(
                FinancialProductProviderOffer.id == provider_offer_id,
                FinancialProductProviderOffer.loan_type_id == product.id,
                FinancialProductProviderOffer.published.is_(True),
                FinancialProductProviderOffer.last_verified_at.is_not(None),
                Bank.active.is_(True),
            )
        )
    ).one_or_none()
    if row is None or not product.public_visible:
        raise ProviderOfferUnavailable(
            "That provider option is no longer published. Continue without it or choose another."
        )
    offer, provider = row
    return offer.id, {
        "offer_id": str(offer.id),
        "provider_id": str(provider.id),
        "provider_name": provider.name,
        "provider_type": provider.provider_type,
        "offer_name": offer.offer_name,
        "min_amount": str(offer.min_amount) if offer.min_amount is not None else None,
        "max_amount": str(offer.max_amount) if offer.max_amount is not None else None,
        "min_interest_rate": (
            str(offer.min_interest_rate) if offer.min_interest_rate is not None else None
        ),
        "max_interest_rate": (
            str(offer.max_interest_rate) if offer.max_interest_rate is not None else None
        ),
        "min_tenure_months": offer.min_tenure_months,
        "max_tenure_months": offer.max_tenure_months,
        "last_verified_at": offer.last_verified_at.isoformat(),
    }


def starter_form_for(category: ProductCategory) -> ProductFormDefinition:
    """Safe initial form used when Admin creates a product before customizing it."""
    if category == ProductCategory.LOAN:
        fields = [
            FormFieldDefinition(
                key="requested_amount",
                label="Requested Loan Amount",
                input_type=FormInputType.CURRENCY,
                placeholder="500000",
            )
        ]
    elif category == ProductCategory.CREDIT_CARD:
        fields = [
            FormFieldDefinition(
                key="income_source",
                label="Primary Income Source",
                input_type=FormInputType.SELECT,
                options=[
                    FormOption(value="salaried", label="Salaried"),
                    FormOption(value="self_employed", label="Self-employed"),
                ],
            )
        ]
    else:
        fields = [
            FormFieldDefinition(
                key="coverage_amount",
                label="Preferred Sum Insured",
                input_type=FormInputType.CURRENCY,
            )
        ]
    return ProductFormDefinition(
        sections=[
            FormSectionDefinition(
                key="application_details",
                title="Application Details",
                fields=fields,
            )
        ]
    )


def form_for_product(product: LoanType) -> ProductFormDefinition:
    category = ProductCategory(product.category)
    if product.custom_fields is None:
        return starter_form_for(category)
    definition = ProductFormDefinition.model_validate(product.custom_fields)
    ensure_category_form(category, definition)
    return definition


def serialize_form(definition: ProductFormDefinition) -> dict:
    return definition.model_dump(mode="json")


def _validated_submission(
    product: LoanType,
    *,
    form_version: int,
    answers: FormAnswers,
) -> tuple[ProductFormDefinition, FormAnswers]:
    if form_version != product.form_version:
        raise StaleFormVersion("This form was updated. Review the latest fields and try again.")
    definition = form_for_product(product)
    try:
        normalized = validate_form_answers(definition, answers)
    except FormAnswersValidationError as exc:
        raise InvalidFormAnswers(str(exc)) from exc
    return definition, normalized


async def create_loan_application(
    db: AsyncSession,
    *,
    product_id: UUID,
    form_version: int,
    answers: FormAnswers,
    client_profile_uuid: UUID,
    mobile: str,
    provider_offer_id: UUID | None = None,
) -> LoanApplication:
    product = await db.get(LoanType, product_id)
    if product is None or not product.active:
        raise ProductNotFound
    if product.category != ProductCategory.LOAN:
        raise WrongProductCategory("Choose a lending product to create a loan application.")

    definition, normalized = _validated_submission(
        product, form_version=form_version, answers=answers
    )
    selected_offer_id, selected_offer_snapshot = await _provider_offer_preference(
        db, product=product, provider_offer_id=provider_offer_id
    )
    amount_requested = Decimal(str(normalized["requested_amount"]))
    lead_id = await resolve_loans_lead(mobile, client_profile_uuid)
    application = LoanApplication(
        lead_uuid=lead_id,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        loan_type_id=product.id,
        preferred_provider_offer_id=selected_offer_id,
        provider_offer_snapshot=selected_offer_snapshot,
        amount_requested=amount_requested,
        form_version=product.form_version,
        form_schema_snapshot=serialize_form(definition),
        form_answers=normalized,
    )
    db.add(application)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ActiveLoanApplicationExists from None
    return application


async def create_service_enquiry(
    db: AsyncSession,
    *,
    product_id: UUID,
    form_version: int,
    answers: FormAnswers,
    client_profile_uuid: UUID,
    mobile: str,
    provider_offer_id: UUID | None = None,
) -> FinancialServiceEnquiry:
    product = await db.get(LoanType, product_id)
    if product is None or not product.active:
        raise ProductNotFound
    if product.category == ProductCategory.LOAN:
        raise WrongProductCategory("Choose a card or insurance product to submit an enquiry.")

    definition, normalized = _validated_submission(
        product, form_version=form_version, answers=answers
    )
    selected_offer_id, selected_offer_snapshot = await _provider_offer_preference(
        db, product=product, provider_offer_id=provider_offer_id
    )
    lead_id = await resolve_loans_lead(mobile, client_profile_uuid)
    enquiry = FinancialServiceEnquiry(
        lead_uuid=lead_id,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        product_id=product.id,
        product_category=product.category,
        preferred_provider_offer_id=selected_offer_id,
        provider_offer_snapshot=selected_offer_snapshot,
        form_version=product.form_version,
        form_schema_snapshot=serialize_form(definition),
        form_answers=normalized,
    )
    db.add(enquiry)
    await db.commit()
    return enquiry
