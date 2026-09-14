"""Add the missing OD/DOD service to the configurable financial catalogue.

Revision ID: e2a4c6f8b0d3
Revises: d9f1a3b5c7e0
Create Date: 2026-09-13

Keep Equipment Financing and every saved Admin configuration. This data-only
addition uses the existing loan workflow, form validation, grants and RLS.
Public publication remains an explicit Admin decision; no provider is seeded.
"""

from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e2a4c6f8b0d3"
down_revision: str | None = "d9f1a3b5c7e0"
branch_labels: str | None = None
depends_on: str | None = None

PRODUCT_ID = UUID("c612a50d-9c20-4af6-8a17-4ce5886b2fd7")

# Frozen migration data: do not import a mutable runtime form template.
FORM: dict[str, Any] = {
    "sections": [
        {
            "key": "applicant_details",
            "title": "Applicant Details",
            "description": (
                "Full name and registered mobile number are securely filled from the account."
            ),
            "fields": [
                {"key": "date_of_birth", "label": "Date of Birth", "input_type": "date"},
            ],
        },
        {
            "key": "business_details",
            "title": "Business Details",
            "fields": [
                {
                    "key": "business_name",
                    "label": "Business or Trade Name",
                    "input_type": "text",
                },
                {
                    "key": "business_constitution",
                    "label": "Business Constitution",
                    "input_type": "select",
                    "options": [
                        {"value": "proprietorship", "label": "Proprietorship"},
                        {"value": "partnership", "label": "Partnership"},
                        {"value": "llp", "label": "Limited Liability Partnership"},
                        {"value": "private_limited", "label": "Private Limited Company"},
                        {"value": "public_limited", "label": "Public Limited Company"},
                        {"value": "trust_society", "label": "Trust or Society"},
                        {"value": "other", "label": "Other"},
                    ],
                },
                {
                    "key": "business_age_years",
                    "label": "Years in Business",
                    "input_type": "integer",
                },
                {"key": "business_location", "label": "Business Location", "input_type": "text"},
                {
                    "key": "business_pincode",
                    "label": "Business PIN Code",
                    "input_type": "pincode",
                },
                {
                    "key": "annual_turnover",
                    "label": "Annual Business Turnover",
                    "input_type": "currency",
                },
            ],
        },
        {
            "key": "facility_details",
            "title": "Overdraft & Funding",
            "fields": [
                {
                    "key": "facility_type",
                    "label": "Facility Type",
                    "input_type": "select",
                    "options": [
                        {"value": "overdraft", "label": "Overdraft (OD)"},
                        {"value": "drop_line_overdraft", "label": "Drop-line Overdraft (DOD)"},
                    ],
                },
                {
                    "key": "requested_amount",
                    "label": "Requested Facility Limit",
                    "input_type": "currency",
                    "required": True,
                },
                {
                    "key": "funding_purpose",
                    "label": "Purpose of Funding",
                    "input_type": "textarea",
                },
                {
                    "key": "preferred_tenure_months",
                    "label": "Preferred Tenure in Months",
                    "input_type": "integer",
                    "required": False,
                    "condition": {
                        "field_key": "facility_type",
                        "equals": "drop_line_overdraft",
                    },
                },
            ],
        },
    ],
}


def upgrade() -> None:
    products = sa.table(
        "loan_types",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String()),
        sa.column("label", sa.String()),
        sa.column("category", sa.String()),
        sa.column("active", sa.Boolean()),
        sa.column("display_order", sa.Integer()),
        sa.column("form_version", sa.Integer()),
        sa.column("custom_fields", postgresql.JSONB()),
        sa.column("public_visible", sa.Boolean()),
        sa.column("public_summary", sa.String()),
        sa.column("public_description", sa.Text()),
    )
    statement = postgresql.insert(products).values(
        id=PRODUCT_ID,
        name="od-and-dod",
        label="OD and DOD",
        category="loan",
        active=True,
        display_order=17,
        form_version=1,
        custom_fields=FORM,
        public_visible=False,
        public_summary=(
            "Overdraft and drop-line overdraft enquiries for business working-capital needs."
        ),
        public_description=(
            "Share your business details, the facility you are considering and your requested "
            "funding limit. Review configured provider information and submit an application "
            "inside Dhanadhara. Availability and terms remain subject to provider review."
        ),
    )
    # An Admin may already have created this slug. Never replace their fields,
    # version, label, activation, publication choice or related submissions.
    op.get_bind().execute(statement.on_conflict_do_nothing(index_elements=["name"]))


def downgrade() -> None:
    # This seed is compatible with the previous schema. Retain it on rollback:
    # deleting it could remove Admin work or break historical application links.
    # Admin can retire the product through the existing deactivation control.
    pass
