"""configurable financial products, versioned forms, and service enquiries

Revision ID: f6a7b8c9d0e1
Revises: e5c6d7e8f9a0
Create Date: 2026-08-21 19:00:00.000000

The legacy-named loan_types table becomes the single authenticated Financial
Products catalogue. Loan products continue through loan_applications; card and
insurance products use financial_service_enquiries and never receive loan
sanction/disbursal fields. Dynamic answers are RLS-protected PII. Form schemas
are versioned and snapshotted on submission.

Lender names and product availability are deliberately not seeded here. They
remain Admin-managed reference data through the existing lender CRUD and
availability matrix.

Downgrade is schema-focused and data-preserving: newly seeded reference rows
remain because later financial records may reference them, while non-loan
products are deactivated before the legacy loan-only schema is restored.
"""

# ruff: noqa: E501 -- declarative form seed rows stay one field per line.

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: str | Sequence[str] | None = "e5c6d7e8f9a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LOAN_TYPE_NAMESPACE = uuid.UUID("6e2a6b0e-6f2b-4b0a-9c1d-7c8f6a5b4d3e")

_RLS = """
    current_setting('app.role', true) = 'admin'
    AND current_setting('app.platform_scope', true) = 'true'
    OR client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    OR (
        business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('employee', 'sub_admin')
    )
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'telecaller'
        AND EXISTS (
            SELECT 1 FROM leads l
            WHERE l.id = financial_service_enquiries.lead_uuid
              AND l.assigned_telecaller_profile_uuid::text
                  = current_setting('app.staff_profile_uuid', true)
        )
    )
"""


def _field(
    key: str,
    label: str,
    input_type: str = "text",
    *,
    required: bool = True,
    options: Sequence[tuple[str, str]] = (),
    condition: tuple[str, str] | None = None,
    placeholder: str | None = None,
    help_text: str | None = None,
) -> dict[str, Any]:
    field: dict[str, Any] = {
        "key": key,
        "label": label,
        "input_type": input_type,
        "required": required,
        "options": [{"value": value, "label": option_label} for value, option_label in options],
        "placeholder": placeholder,
        "help_text": help_text,
        "condition": None,
    }
    if condition:
        field["condition"] = {"field_key": condition[0], "equals": condition[1]}
    return field


def _section(
    key: str, title: str, fields: Sequence[dict[str, Any]], description: str | None = None
) -> dict[str, Any]:
    return {"key": key, "title": title, "description": description, "fields": list(fields)}


_EMPLOYMENT = (("salaried", "Salaried"), ("self_employed", "Self-employed"))
_CONSTITUTION = (
    ("proprietorship", "Proprietorship"),
    ("partnership", "Partnership"),
    ("llp", "Limited Liability Partnership"),
    ("private_limited", "Private Limited Company"),
    ("public_limited", "Public Limited Company"),
    ("trust_society", "Trust or Society"),
    ("other", "Other"),
)
_INCOME_FIELDS = (
    _field("income_source", "Primary Income Source", "select", options=_EMPLOYMENT),
    _field(
        "net_monthly_income",
        "Net Monthly Income",
        "currency",
        condition=("income_source", "salaried"),
    ),
    _field(
        "net_annual_income",
        "Net Annual Income",
        "currency",
        condition=("income_source", "self_employed"),
    ),
)


def _identity(*, dob: bool = True) -> dict[str, Any]:
    fields = []
    if dob:
        fields.append(_field("date_of_birth", "Date of Birth", "date"))
    return _section(
        "applicant_details",
        "Applicant Details",
        fields or [_field("applicant_role", "Applicant Role")],
        "Full name and registered mobile number are securely filled from the account.",
    )


def _location(prefix: str = "current") -> tuple[dict[str, Any], dict[str, Any]]:
    scope = prefix.replace("_", " ").title()
    return (
        _field(f"{prefix}_location", f"{scope} Location"),
        _field(f"{prefix}_pincode", f"{scope} PIN Code", "pincode"),
    )


def _form(*sections: dict[str, Any]) -> dict[str, Any]:
    return {"sections": list(sections)}


def _products() -> list[dict[str, Any]]:
    income_documents = (
        ("salary_slips", "Salary Slips"),
        ("form_16", "Form 16"),
        ("itr", "Income Tax Returns"),
        ("bank_statements", "Bank Statements"),
    )
    return [
        {
            "name": "personal-loan",
            "label": "Personal Loan",
            "category": "loan",
            "order": 1,
            "form": _form(
                _identity(),
                _section(
                    "employment_and_finance",
                    "Employment & Finance",
                    (
                        *_location(),
                        _field("employment_type", "Employment Type", "select", options=_EMPLOYMENT),
                        _field("net_monthly_salary", "Net Monthly Salary", "currency"),
                        _field("work_experience_years", "Total Work Experience (Years)", "integer"),
                        _field("requested_amount", "Requested Loan Amount", "currency"),
                    ),
                ),
            ),
        },
        {
            "name": "business-loan",
            "label": "Business Loan",
            "category": "loan",
            "order": 2,
            "form": _form(
                _identity(),
                _section(
                    "business_details",
                    "Business Details",
                    (
                        _field("business_name", "Business or Trade Name"),
                        _field(
                            "business_constitution",
                            "Business Constitution",
                            "select",
                            options=_CONSTITUTION,
                        ),
                        _field("business_age_years", "Years in Business", "integer"),
                        *_location("business"),
                    ),
                ),
                _section(
                    "income_and_funding",
                    "Income & Funding",
                    (
                        _field("latest_itr_income", "Latest Financial Year ITR Income", "currency"),
                        _field(
                            "previous_itr_income", "Previous Financial Year ITR Income", "currency"
                        ),
                        _field("requested_amount", "Requested Loan Amount", "currency"),
                        _field("loan_purpose", "Purpose of Loan", "textarea"),
                    ),
                ),
            ),
        },
        {
            "name": "home-loan",
            "label": "Home Loan",
            "category": "loan",
            "order": 3,
            "form": _form(
                _identity(),
                _section(
                    "income_details",
                    "Income Details",
                    (
                        *_INCOME_FIELDS,
                        _field(
                            "income_documents",
                            "Available Income Documents",
                            "multi_select",
                            options=income_documents,
                        ),
                    ),
                ),
                _section(
                    "property_and_finance",
                    "Property & Finance",
                    (
                        _field(
                            "property_stage",
                            "Property Purchase Stage",
                            "select",
                            options=(
                                ("under_construction", "Under Construction"),
                                ("ready_to_move", "Ready to Move"),
                                ("resale", "Resale"),
                            ),
                        ),
                        _field("property_value", "Estimated Property Value", "currency"),
                        *_location("property"),
                        _field("requested_amount", "Requested Loan Amount", "currency"),
                    ),
                ),
            ),
        },
        {
            "name": "loan-against-property",
            "label": "Loan Against Property",
            "category": "loan",
            "order": 4,
            "form": _form(
                _identity(),
                _section(
                    "income_details",
                    "Income Details",
                    (
                        *_INCOME_FIELDS,
                        _field(
                            "income_documents",
                            "Available Income Documents",
                            "multi_select",
                            options=income_documents,
                        ),
                    ),
                ),
                _section(
                    "property_and_finance",
                    "Property & Finance",
                    (
                        _field(
                            "property_category",
                            "Property Category",
                            "select",
                            options=(
                                ("residential", "Residential"),
                                ("commercial", "Commercial"),
                                ("industrial", "Industrial"),
                                ("land", "Land"),
                            ),
                        ),
                        _field(
                            "ownership_status",
                            "Ownership Status",
                            "select",
                            options=(
                                ("self_owned", "Self-owned"),
                                ("jointly_owned", "Jointly Owned"),
                                ("family_owned", "Family-owned"),
                            ),
                        ),
                        _field("property_value", "Estimated Market Value", "currency"),
                        *_location("property"),
                        _field("requested_amount", "Requested Loan Amount", "currency"),
                        _field("loan_purpose", "Purpose of Loan", "textarea"),
                    ),
                ),
            ),
        },
        {
            "name": "car-loan",
            "label": "Car Loan",
            "category": "loan",
            "order": 5,
            "form": _form(
                _identity(),
                _section("income_details", "Income Details", _INCOME_FIELDS),
                _section(
                    "vehicle_and_finance",
                    "Vehicle & Finance",
                    (
                        _field(
                            "vehicle_condition",
                            "Vehicle Condition",
                            "select",
                            options=(("new", "New"), ("used", "Used")),
                        ),
                        _field("manufacturer", "Car Manufacturer"),
                        _field("model_variant", "Model and Variant"),
                        _field("vehicle_price", "On-road or Purchase Price", "currency"),
                        *_location("registration"),
                        _field("requested_amount", "Requested Loan Amount", "currency"),
                    ),
                ),
            ),
        },
        {
            "name": "education-loan",
            "label": "Education Loan",
            "category": "loan",
            "order": 6,
            "form": _form(
                _identity(),
                _section(
                    "education_details",
                    "Education Details",
                    (
                        _field("course_name", "Course or Programme"),
                        _field("institution_name", "Institution or University"),
                        _field("country_of_study", "Country of Study"),
                        _field(
                            "admission_status",
                            "Admission Status",
                            "select",
                            options=(
                                ("planning", "Planning to Apply"),
                                ("applied", "Applied"),
                                ("offer_received", "Offer Received"),
                                ("admitted", "Admitted"),
                            ),
                        ),
                        _field("education_cost", "Total Education Cost", "currency"),
                        _field("requested_amount", "Requested Loan Amount", "currency"),
                    ),
                ),
                _section(
                    "co_applicant_details",
                    "Co-applicant Details",
                    (
                        _field("co_applicant_name", "Co-applicant Full Name"),
                        _field("co_applicant_mobile", "Co-applicant Mobile Number", "phone"),
                        _field("co_applicant_date_of_birth", "Co-applicant Date of Birth", "date"),
                        _field("co_applicant_relationship", "Relationship to Applicant"),
                        _field(
                            "co_applicant_income_source",
                            "Co-applicant Income Source",
                            "select",
                            options=_EMPLOYMENT,
                        ),
                        _field(
                            "co_applicant_monthly_income",
                            "Co-applicant Net Monthly Income",
                            "currency",
                            condition=("co_applicant_income_source", "salaried"),
                        ),
                        _field(
                            "co_applicant_annual_income",
                            "Co-applicant Net Annual Income",
                            "currency",
                            condition=("co_applicant_income_source", "self_employed"),
                        ),
                    ),
                ),
            ),
        },
        {
            "name": "vehicle-loan",
            "label": "Commercial Vehicle & Two-Wheeler Loan",
            "category": "loan",
            "order": 7,
            "form": _form(
                _identity(),
                _section("income_details", "Income Details", _INCOME_FIELDS),
                _section(
                    "vehicle_and_finance",
                    "Vehicle & Finance",
                    (
                        _field(
                            "vehicle_type",
                            "Vehicle Type",
                            "select",
                            options=(
                                ("two_wheeler", "Two-wheeler"),
                                ("commercial_vehicle", "Commercial Vehicle"),
                                ("passenger_vehicle", "Passenger Vehicle"),
                                ("other", "Other"),
                            ),
                        ),
                        _field(
                            "vehicle_use",
                            "Intended Use",
                            "select",
                            options=(("personal", "Personal"), ("commercial", "Commercial")),
                        ),
                        _field(
                            "vehicle_condition",
                            "Vehicle Condition",
                            "select",
                            options=(("new", "New"), ("used", "Used")),
                        ),
                        _field("manufacturer", "Vehicle Manufacturer"),
                        _field("model", "Vehicle Model"),
                        _field("vehicle_price", "Quoted Vehicle Price", "currency"),
                        *_location(),
                        _field("requested_amount", "Requested Loan Amount", "currency"),
                    ),
                ),
            ),
        },
        {
            "name": "equipment-financing",
            "label": "Equipment Financing",
            "category": "loan",
            "order": 8,
            "form": _form(
                _identity(),
                _section(
                    "business_and_income",
                    "Business & Income",
                    (
                        _field("business_name", "Business or Organization Name"),
                        _field(
                            "business_constitution",
                            "Business Constitution",
                            "select",
                            options=_CONSTITUTION,
                        ),
                        _field("business_age_years", "Years in Operation", "integer"),
                        *_INCOME_FIELDS,
                    ),
                ),
                _section(
                    "equipment_and_finance",
                    "Equipment & Finance",
                    (
                        _field("equipment_category", "Equipment Category"),
                        _field("manufacturer", "Equipment Manufacturer"),
                        _field("model", "Equipment Model"),
                        _field("equipment_price", "Supplier Quotation Price", "currency"),
                        *_location("business"),
                        _field("requested_amount", "Requested Finance Amount", "currency"),
                    ),
                ),
            ),
        },
        {
            "name": "school-funding",
            "label": "Educational Institution Funding",
            "category": "loan",
            "order": 9,
            "form": _form(
                _section(
                    "institution_details",
                    "Institution Details",
                    (
                        _field("authorized_representative_name", "Authorized Representative Name"),
                        _field(
                            "authorized_representative_mobile",
                            "Authorized Representative Mobile",
                            "phone",
                        ),
                        _field("institution_name", "School or Institution Name"),
                        _field("managing_organization", "Managing Organization, Trust, or Society"),
                        _field("registration_type", "Registration or Affiliation Type"),
                        _field("registration_number", "Registration or Affiliation Number"),
                        _field("institution_age_years", "Years in Operation", "integer"),
                        *_location("institution"),
                    ),
                ),
                _section(
                    "funding_details",
                    "Funding Details",
                    (
                        _field("funding_purpose", "Funding Purpose", "textarea"),
                        _field("requested_amount", "Requested Funding Amount", "currency"),
                    ),
                ),
            ),
        },
        {
            "name": "secured-loans",
            "label": "Loan Against Financial Assets",
            "category": "loan",
            "order": 10,
            "form": _form(
                _identity(),
                _section(
                    "collateral_and_finance",
                    "Collateral & Finance",
                    (
                        *_location(),
                        _field(
                            "asset_type",
                            "Collateral Asset Type",
                            "select",
                            options=(
                                ("fixed_deposit", "Fixed Deposit"),
                                ("bond", "Bond"),
                                ("security", "Listed Security"),
                            ),
                        ),
                        _field("issuer_name", "Issuer or Financial Institution"),
                        _field(
                            "face_value", "Face Value", "currency", condition=("asset_type", "bond")
                        ),
                        _field(
                            "market_value",
                            "Current Market Value",
                            "currency",
                            condition=("asset_type", "security"),
                        ),
                        _field(
                            "deposit_value",
                            "Fixed Deposit Value",
                            "currency",
                            condition=("asset_type", "fixed_deposit"),
                        ),
                        _field("requested_amount", "Requested Loan Amount", "currency"),
                    ),
                ),
            ),
        },
        {
            "name": "credit-cards",
            "label": "Credit Cards",
            "category": "credit_card",
            "order": 11,
            "form": _form(
                _identity(),
                _section(
                    "income_and_preferences",
                    "Income & Preferences",
                    (
                        *_INCOME_FIELDS,
                        _field("occupation_or_business", "Employer, Occupation, or Business Name"),
                        *_location(),
                        _field(
                            "preferred_benefits",
                            "Preferred Card Benefits",
                            "multi_select",
                            required=False,
                            options=(
                                ("cashback", "Cashback"),
                                ("travel", "Travel Rewards"),
                                ("fuel", "Fuel Benefits"),
                                ("shopping", "Shopping Rewards"),
                                ("lounge", "Airport Lounge Access"),
                            ),
                        ),
                    ),
                ),
            ),
        },
        {
            "name": "life-insurance",
            "label": "Life & Term Insurance",
            "category": "insurance",
            "order": 12,
            "form": _form(
                _identity(),
                _section(
                    "coverage_details",
                    "Income & Coverage",
                    (
                        _field(
                            "insurance_type",
                            "Insurance Type",
                            "select",
                            options=(("term", "Term Insurance"), ("life", "Life Insurance")),
                        ),
                        _field("income_source", "Income Source", "select", options=_EMPLOYMENT),
                        _field("occupation", "Occupation"),
                        _field("net_annual_income", "Net Annual Income", "currency"),
                        _field("cover_term_years", "Preferred Cover Term (Years)", "integer"),
                        _field("coverage_amount", "Desired Sum Assured", "currency"),
                        _field("annual_premium_budget", "Annual Premium Budget", "currency"),
                    ),
                ),
            ),
        },
        {
            "name": "health-insurance",
            "label": "Health Insurance",
            "category": "insurance",
            "order": 13,
            "form": _form(
                _identity(),
                _section(
                    "coverage_details",
                    "Coverage Details",
                    (
                        _field(
                            "coverage_type",
                            "Coverage Type",
                            "select",
                            options=(
                                ("individual", "Individual"),
                                ("family_floater", "Family Floater"),
                                ("senior_citizen", "Senior Citizen"),
                            ),
                        ),
                        _field("members_to_cover", "Members to Cover", "integer"),
                        *_location(),
                        _field("coverage_amount", "Desired Sum Insured", "currency"),
                    ),
                ),
            ),
        },
        {
            "name": "property-insurance",
            "label": "Property Insurance",
            "category": "insurance",
            "order": 14,
            "form": _form(
                _identity(),
                _section(
                    "property_and_coverage",
                    "Property & Coverage",
                    (
                        _field(
                            "property_use",
                            "Property Use",
                            "select",
                            options=(
                                ("residential", "Residential"),
                                ("commercial", "Commercial"),
                                ("industrial", "Industrial"),
                            ),
                        ),
                        _field(
                            "occupancy_status",
                            "Ownership or Occupancy",
                            "select",
                            options=(
                                ("owner_occupied", "Owner Occupied"),
                                ("tenant_occupied", "Tenant Occupied"),
                                ("vacant", "Vacant"),
                            ),
                        ),
                        _field("property_age_years", "Property Age (Years)", "integer"),
                        _field("property_value", "Estimated Reinstatement Value", "currency"),
                        *_location("property"),
                        _field("coverage_amount", "Desired Sum Insured", "currency"),
                    ),
                ),
            ),
        },
        {
            "name": "travel-insurance",
            "label": "Travel Insurance",
            "category": "insurance",
            "order": 15,
            "form": _form(
                _identity(),
                _section(
                    "trip_and_coverage",
                    "Trip & Coverage",
                    (
                        _field("traveller_count", "Number of Travellers", "integer"),
                        _field(
                            "trip_type",
                            "Trip Type",
                            "select",
                            options=(
                                ("single_trip", "Single Trip"),
                                ("multi_trip", "Annual Multi-trip"),
                            ),
                        ),
                        _field("departure_location", "Departure Location"),
                        _field("destination_countries", "Destination Country or Countries"),
                        _field("departure_date", "Departure Date", "date"),
                        _field("return_date", "Return Date", "date"),
                        _field(
                            "travel_purpose",
                            "Travel Purpose",
                            "select",
                            options=(
                                ("leisure", "Leisure"),
                                ("business", "Business"),
                                ("study", "Study"),
                                ("medical", "Medical"),
                                ("other", "Other"),
                            ),
                        ),
                        _field(
                            "primary_travel_mode",
                            "Primary Travel Mode",
                            "select",
                            required=False,
                            options=(
                                ("air", "Air"),
                                ("rail", "Rail"),
                                ("road", "Road"),
                                ("sea", "Sea"),
                                ("mixed", "Multiple Modes"),
                            ),
                        ),
                        _field("coverage_amount", "Desired Sum Insured", "currency"),
                    ),
                ),
            ),
        },
        {
            "name": "project-funding",
            "label": "Real Estate Project Finance",
            "category": "loan",
            "order": 16,
            "form": _form(
                _section(
                    "developer_details",
                    "Developer Details",
                    (
                        _field("authorized_representative_name", "Authorized Representative Name"),
                        _field(
                            "authorized_representative_mobile",
                            "Authorized Representative Mobile",
                            "phone",
                        ),
                        _field(
                            "authorized_representative_date_of_birth",
                            "Representative Date of Birth",
                            "date",
                        ),
                        _field("developer_legal_name", "Developer Legal Name"),
                        _field(
                            "business_constitution",
                            "Business Constitution",
                            "select",
                            options=_CONSTITUTION,
                        ),
                        _field("business_age_years", "Years in Operation", "integer"),
                        _field("rera_registration", "RERA Registration Number"),
                        _field("completed_projects", "Completed Projects", "integer"),
                        _field("ongoing_projects", "Ongoing Projects", "integer"),
                    ),
                ),
                _section(
                    "project_and_funding",
                    "Project & Funding",
                    (
                        _field("project_name", "Current Project Name"),
                        _field("project_stage", "Current Project Stage"),
                        _field("project_value", "Total Project Cost", "currency"),
                        _field("requested_amount", "Requested Funding Amount", "currency"),
                        *_location("project"),
                    ),
                ),
            ),
        },
    ]


def _product_id(name: str) -> uuid.UUID:
    return uuid.uuid5(_LOAN_TYPE_NAMESPACE, name)


def upgrade() -> None:
    op.add_column(
        "loan_types",
        sa.Column("category", sa.String(length=20), nullable=False, server_default="loan"),
    )
    op.add_column(
        "loan_types",
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="1000"),
    )
    op.add_column(
        "loan_types", sa.Column("form_version", sa.Integer(), nullable=False, server_default="1")
    )
    op.create_check_constraint(
        "loan_types_category", "loan_types", "category IN ('loan', 'credit_card', 'insurance')"
    )
    op.create_check_constraint("loan_types_display_order", "loan_types", "display_order >= 0")
    op.create_check_constraint("loan_types_form_version", "loan_types", "form_version >= 1")
    op.execute(
        "GRANT UPDATE (custom_fields, display_order, form_version) ON loan_types TO api_user"
    )

    op.add_column("loan_applications", sa.Column("form_version", sa.Integer(), nullable=True))
    op.add_column(
        "loan_applications", sa.Column("form_schema_snapshot", postgresql.JSONB(), nullable=True)
    )
    op.add_column("loan_applications", sa.Column("form_answers", postgresql.JSONB(), nullable=True))

    op.create_table(
        "financial_service_enquiries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("lead_uuid", sa.UUID(), nullable=False),
        sa.Column("client_profile_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("product_category", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="submitted"),
        sa.Column("form_version", sa.Integer(), nullable=False),
        sa.Column("form_schema_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("form_answers", postgresql.JSONB(), nullable=True),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "product_category IN ('credit_card', 'insurance')",
            name="ck_financial_service_enquiries_product_category",
        ),
        sa.CheckConstraint("status = 'submitted'", name="ck_financial_service_enquiries_status"),
        sa.CheckConstraint("form_version >= 1", name="ck_financial_service_enquiries_form_version"),
        sa.ForeignKeyConstraint(
            ["lead_uuid"], ["leads.id"], name=op.f("fk_financial_service_enquiries_lead_uuid_leads")
        ),
        sa.ForeignKeyConstraint(
            ["client_profile_uuid"],
            ["client_profiles.id"],
            name=op.f("fk_financial_service_enquiries_client_profile_uuid_client_profiles"),
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["loan_types.id"],
            name=op.f("fk_financial_service_enquiries_product_id_loan_types"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_financial_service_enquiries")),
    )
    op.create_index(
        op.f("ix_financial_service_enquiries_client_profile_uuid"),
        "financial_service_enquiries",
        ["client_profile_uuid"],
    )
    op.create_index(
        op.f("ix_financial_service_enquiries_lead_uuid"),
        "financial_service_enquiries",
        ["lead_uuid"],
    )
    op.create_index(
        op.f("ix_financial_service_enquiries_product_id"),
        "financial_service_enquiries",
        ["product_id"],
    )
    op.execute("GRANT SELECT, INSERT ON financial_service_enquiries TO api_user")
    op.execute("ALTER TABLE financial_service_enquiries ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY financial_service_enquiries_rls ON financial_service_enquiries
        FOR ALL USING ({_RLS}) WITH CHECK ({_RLS});
        """
    )

    bind = op.get_bind()
    loan_types = sa.table(
        "loan_types",
        sa.column("id", sa.UUID()),
        sa.column("name", sa.String()),
        sa.column("label", sa.String()),
        sa.column("active", sa.Boolean()),
        sa.column("category", sa.String()),
        sa.column("display_order", sa.Integer()),
        sa.column("form_version", sa.Integer()),
        sa.column("custom_fields", postgresql.JSONB()),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    for product in _products():
        statement = postgresql.insert(loan_types).values(
            id=_product_id(product["name"]),
            name=product["name"],
            label=product["label"],
            active=True,
            category=product["category"],
            display_order=product["order"],
            form_version=1,
            custom_fields=product["form"],
        )
        bind.execute(
            statement.on_conflict_do_update(
                index_elements=["name"],
                set_={
                    "label": statement.excluded.label,
                    "active": True,
                    "category": statement.excluded.category,
                    "display_order": statement.excluded.display_order,
                    "form_version": 1,
                    "custom_fields": statement.excluded.custom_fields,
                    "updated_at": sa.func.now(),
                },
            )
        )
    bind.execute(
        sa.text("UPDATE loan_types SET active = false WHERE name IN ('property-loan', 'insurance')")
    )


def downgrade() -> None:
    op.execute("UPDATE loan_types SET active = false WHERE category <> 'loan'")
    op.execute(
        "DROP POLICY IF EXISTS financial_service_enquiries_rls ON financial_service_enquiries"
    )
    op.execute("ALTER TABLE financial_service_enquiries DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT ON financial_service_enquiries FROM api_user")
    op.drop_index(
        op.f("ix_financial_service_enquiries_product_id"),
        table_name="financial_service_enquiries",
    )
    op.drop_index(
        op.f("ix_financial_service_enquiries_lead_uuid"), table_name="financial_service_enquiries"
    )
    op.drop_index(
        op.f("ix_financial_service_enquiries_client_profile_uuid"),
        table_name="financial_service_enquiries",
    )
    op.drop_table("financial_service_enquiries")

    op.drop_column("loan_applications", "form_answers")
    op.drop_column("loan_applications", "form_schema_snapshot")
    op.drop_column("loan_applications", "form_version")
    op.execute(
        "REVOKE UPDATE (custom_fields, display_order, form_version) ON loan_types FROM api_user"
    )
    op.drop_constraint("loan_types_form_version", "loan_types", type_="check")
    op.drop_constraint("loan_types_display_order", "loan_types", type_="check")
    op.drop_constraint("loan_types_category", "loan_types", type_="check")
    op.drop_column("loan_types", "form_version")
    op.drop_column("loan_types", "display_order")
    op.drop_column("loan_types", "category")
