"""Seed a few PENDING property submissions for the Admin review queue (dev only).

The submitter's mobile is a required argument (any registered account — its
auth_users.id becomes submitter_uuid, which only needs to be a valid FK for the
queue to render):

    docker exec mahesh-client-project-api-1 \\
        uv run python -m app.scripts.seed_submissions +919812345678

Inserts through AsyncSessionLocal as the `app` superuser (bypasses RLS). Idempotent:
skips if this submitter already has pending submissions. Production ships EMPTY —
real drafts arrive via the agent submit endpoint.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import func, select, text


async def _seed(mobile: str) -> None:
    import app.db.session as session_mod
    from app.models.property_submission import PropertySubmission, SubmissionStatus

    async with session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        if row is None:
            print(f"[seed_submissions] No account for {mobile}. Register it first, then re-run.")
            return
        submitter = row[0]

        existing = await db.scalar(
            select(func.count())
            .select_from(PropertySubmission)
            .where(
                PropertySubmission.submitter_uuid == submitter,
                PropertySubmission.status == SubmissionStatus.PENDING,
            )
        )
        if existing:
            print(
                f"[seed_submissions] {existing} pending submission(s) already present — skipping."
            )
            return

        subs = [
            PropertySubmission(
                submitter_uuid=submitter,
                business_line="real_estate",
                title="3BHK Apartment in Indiranagar",
                type="Apartment",
                location="Indiranagar, Bengaluru",
                meta="3 bed · 1,650 sqft",
                category="apartments",
                property_subtype="standalone_apartment",
                city="Bengaluru",
                locality="Indiranagar",
                pincode="560038",
                price_paise=1_35_00_00_000,
                bhk=3,
                area_sqft=1650,
                furnishing="semi",
                construction_status="ready",
                amenities=["Lift", "Covered Parking", "Power Backup"],
                age_years=4,
                rera_number="RERA/RE/2026/00311",
            ),
            PropertySubmission(
                submitter_uuid=submitter,
                business_line="real_estate",
                title="Commercial Office, MG Road",
                type="Office",
                location="MG Road, Bengaluru",
                meta="2,400 sqft",
                category="commercial",
                property_subtype="locked_space",
                city="Bengaluru",
                locality="MG Road",
                pincode="560001",
                price_paise=3_20_00_00_000,
                area_sqft=2400,
                furnishing="unfurnished",
                construction_status="ready",
                amenities=["Central AC", "Reserved Parking"],
                age_years=2,
                rera_number="RERA/RE/2026/00312",
            ),
            PropertySubmission(
                submitter_uuid=submitter,
                business_line="real_estate",
                title="Residential Plot, Sarjapur",
                type="Plot",
                location="Sarjapur, Bengaluru",
                meta="2,400 sqft",
                category="plots",
                property_subtype="plot",
                city="Bengaluru",
                locality="Sarjapur",
                pincode="562125",
                price_paise=85_00_00_000,
                area_sqft=2400,
                furnishing="unfurnished",
                construction_status="ready",
                amenities=["Gated Layout"],
                rera_number="RERA/RE/2026/00313",
            ),
        ]
        db.add_all(subs)
        await db.commit()
        print(f"[seed_submissions] Inserted {len(subs)} pending submissions (submitter {mobile}).")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m app.scripts.seed_submissions <mobile-e164>   e.g. +919812345678")
        sys.exit(1)
    asyncio.run(_seed(sys.argv[1]))


if __name__ == "__main__":
    main()
