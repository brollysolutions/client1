"""Every marketed service has editable, versioned Admin intake configuration."""

import copy
import uuid
from datetime import date, timedelta
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from httpx import AsyncClient
from sqlalchemy import text

from app.schemas.financial_products import ProductFormDefinition, ensure_category_form
from conftest import full_registration

from .test_loan_config_api import _admin_headers

SERVICE_FIELDS = {
    "personal-loan": ("loan", "net_monthly_salary"),
    "business-loan": ("loan", "business_constitution"),
    "home-loan": ("loan", "property_stage"),
    "loan-against-property": ("loan", "ownership_status"),
    "car-loan": ("loan", "vehicle_condition"),
    "vehicle-loan": ("loan", "vehicle_type"),
    "education-loan": ("loan", "course_name"),
    "school-funding": ("loan", "institution_name"),
    "secured-loans": ("loan", "asset_type"),
    "od-and-dod": ("loan", "facility_type"),
    "project-funding": ("loan", "project_stage"),
    "life-insurance": ("insurance", "insurance_type"),
    "health-insurance": ("insurance", "members_to_cover"),
    "property-insurance": ("insurance", "property_use"),
    "travel-insurance": ("insurance", "destination_countries"),
    "credit-cards": ("credit_card", "preferred_benefits"),
    # Retain the earlier approved service alongside the public navbar's 16.
    "equipment-financing": ("loan", "equipment_category"),
}


def _answers(form: dict) -> dict[str, str | list[str]]:
    """Synthetic values for the actual configured field types and conditions."""
    answers: dict[str, str | list[str]] = {}
    for section in form["sections"]:
        for field in section["fields"]:
            condition = field.get("condition")
            if condition and answers.get(condition["field_key"]) != condition["equals"]:
                continue
            kind = field["input_type"]
            if kind in ("select", "multi_select"):
                option = field["options"][0]["value"]
                value = [option] if kind == "multi_select" else option
            elif kind == "date":
                value = (
                    "1990-01-01"
                    if field["key"].endswith("date_of_birth")
                    else (date.today() + timedelta(days=30)).isoformat()
                )
            else:
                value = {
                    "currency": "100000",
                    "integer": "2",
                    "pincode": "560001",
                    "phone": "9876543210",
                }.get(kind, "Synthetic form review")
            answers[field["key"]] = value
    return answers


@pytest.mark.asyncio
@pytest.mark.parametrize("slug", SERVICE_FIELDS)
async def test_every_service_configuration_round_trips_and_preserves_submissions(
    client: AsyncClient, slug: str
) -> None:
    admin = await _admin_headers(client)
    catalogue = await client.get("/api/v1/admin/loan-types", headers=admin)
    assert catalogue.status_code == 200, catalogue.text
    original = next(row for row in catalogue.json()["loan_types"] if row["name"] == slug)
    category, distinctive_field = SERVICE_FIELDS[slug]
    assert original["category"] == category
    fields = [
        field for section in original["form_schema"]["sections"] for field in section["fields"]
    ]
    assert distinctive_field in {field["key"] for field in fields}
    assert len(fields) >= 6
    assert "full_name" not in {field["key"] for field in fields}

    # Clone through the real API; never edit a seeded row or its saved version.
    created = await client.post(
        "/api/v1/admin/loan-types",
        headers=admin,
        json={
            "label": f"Form review {slug} {uuid.uuid4().hex[:8]}",
            "category": category,
            "form_schema": original["form_schema"],
        },
    )
    assert created.status_code == 201, created.text
    product = created.json()
    path = f"/api/v1/admin/loan-types/{product['id']}"
    try:
        token, _ = await full_registration(client, lines=["loans"])
        owner = {"Authorization": f"Bearer {token}"}
        is_loan = category == "loan"
        endpoint = "/api/v1/loans/applications" if is_loan else "/api/v1/loans/enquiries"
        payload = {
            "loan_type_id" if is_loan else "product_id": product["id"],
            "form_version": product["form_version"],
            "answers": _answers(product["form_schema"]),
        }
        submitted = await client.post(endpoint, headers=owner, json=payload)
        assert submitted.status_code == 201, submitted.text
        snapshot = submitted.json()
        assert snapshot["form_schema_snapshot"] == product["form_schema"]

        edited_form = copy.deepcopy(product["form_schema"])
        edited_form["sections"][0]["fields"].append(
            {
                "key": "additional_context",
                "label": "Additional Context",
                "input_type": "textarea",
                "required": False,
            }
        )
        saved = await client.patch(
            path, headers=admin, json={"display_order": 321, "form_schema": edited_form}
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["form_version"] == 2
        assert saved.json()["display_order"] == 321

        published = await client.get("/api/v1/loans/loan-types", headers=owner)
        current = next(row for row in published.json()["loan_types"] if row["id"] == product["id"])
        assert current["form_schema"] == saved.json()["form_schema"]
        assert current["form_version"] == 2
        history = await client.get(endpoint, headers=owner)
        records = history.json()["applications" if is_loan else "enquiries"]
        historical = next(row for row in records if row["id"] == snapshot["id"])
        assert historical["form_version"] == 1
        assert historical["form_schema_snapshot"] == snapshot["form_schema_snapshot"]
        stale = await client.post(endpoint, headers=owner, json=payload)
        assert stale.status_code == 409, stale.text

        # Activation remains a product setting, regardless of workflow category.
        retired = await client.patch(path, headers=admin, json={"active": False})
        assert retired.status_code == 200, retired.text
        current_list = await client.get("/api/v1/loans/loan-types", headers=owner)
        assert product["id"] not in {row["id"] for row in current_list.json()["loan_types"]}
    finally:
        await client.patch(path, headers=admin, json={"active": False})


def _overdraft_migration():
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parents[2] / "alembic"))
    return ScriptDirectory.from_config(config).get_revision("e2a4c6f8b0d3").module


def test_overdraft_form_uses_the_existing_allowlisted_loan_contract() -> None:
    form = ProductFormDefinition.model_validate(_overdraft_migration().FORM)
    ensure_category_form("loan", form)
    facility = next(field for field in form.fields() if field.key == "facility_type")
    assert {option.value for option in facility.options} == {"overdraft", "drop_line_overdraft"}


@pytest.mark.asyncio
async def test_overdraft_seed_is_idempotent_and_never_overwrites_admin_configuration() -> None:
    import app.db.session as session_module

    migration = _overdraft_migration()
    async with session_module.AsyncSessionLocal() as db:
        connection = await db.connection()

        def verify(sync_connection):
            # Shadow the real catalogue with a transaction-local table. The real
            # seed, submissions, providers and publication data are never touched.
            sync_connection.execute(
                text(
                    "CREATE TEMP TABLE loan_types (LIKE public.loan_types INCLUDING ALL) "
                    "ON COMMIT DROP"
                )
            )
            with Operations.context(MigrationContext.configure(sync_connection)):
                migration.upgrade()
                migration.upgrade()
                rows = sync_connection.execute(text("SELECT * FROM loan_types")).mappings().all()
                assert len(rows) == 1
                assert rows[0]["name"] == "od-and-dod"
                assert rows[0]["active"] is True
                assert rows[0]["public_visible"] is False
                assert rows[0]["custom_fields"] == migration.FORM
                sync_connection.execute(
                    text(
                        "UPDATE loan_types SET id = :id, label = 'Admin saved OD', "
                        "active = false, public_visible = true, form_version = 9, "
                        "custom_fields = :form, display_order = 222"
                    ),
                    {"id": uuid.uuid4(), "form": '{"admin_saved": true}'},
                )
                before = dict(
                    sync_connection.execute(text("SELECT * FROM loan_types")).mappings().one()
                )
                migration.upgrade()
                migration.downgrade()
                after = dict(
                    sync_connection.execute(text("SELECT * FROM loan_types")).mappings().one()
                )
                assert after == before

        await connection.run_sync(verify)
        await db.rollback()
