"""Populate the real-estate `properties` catalog for local development.

Dev only, and NOT per-user (a property catalog belongs to no client), so unlike
app.scripts.seed_dev this takes no mobile argument:

    docker exec mahesh-client-project-api-1 \\
        uv run python -m app.scripts.seed_properties

Inserts the same 28 sample listings the frontend used to hardcode
(apps/web/lib/real-estate.ts) so the RE dashboard renders real data. Structured
facet columns (city/locality/bhk/area_sqft/price_paise) are computed here with
the SAME parsing the frontend derivation used, so the catalog is a faithful
mirror. Inserts through AsyncSessionLocal as the `app` superuser (bypasses RLS),
in curated order so the client-side "Featured" strip stays stable.

Idempotent: no-ops if the table already has any rows. Production ships EMPTY
(listings go live via the Admin-approved property_submissions workflow, a later
slice); this script is dev-only.
"""

from __future__ import annotations

import asyncio
import re

# Raw listings, verbatim from apps/web/lib/real-estate.ts RAW_LISTINGS (curated
# order h1..c6). Structured fields are derived below, not hand-transcribed.
_RAW: list[dict] = [
    {
        "id": "h1",
        "title": "Independent House",
        "location": "Kondapur, Hyderabad",
        "price": "₹1.35 Cr",
        "type": "House",
        "category": "houses",
        "meta": "3 bed · 2,100 sqft",
        "image": "/illustrations/properties/villa-3.svg",
        "pincode": "500084",
        "furnishing": "furnished",
        "status": "ready",
        "amenities": ["parking", "security", "power_backup"],
        "age_years": 5,
    },
    {
        "id": "h2",
        "title": "3 BHK Row House",
        "location": "Bavdhan, Pune",
        "price": "₹1.15 Cr",
        "type": "House",
        "category": "houses",
        "meta": "3 bed · 1,900 sqft",
        "image": "/illustrations/properties/villa-3.svg",
        "pincode": "411021",
        "furnishing": "semi",
        "status": "ready",
        "amenities": ["parking", "lift", "security"],
        "age_years": 3,
    },
    {
        "id": "h3",
        "title": "2 BHK Independent House",
        "location": "Uppal, Hyderabad",
        "price": "₹85 L",
        "type": "House",
        "category": "houses",
        "meta": "2 bed · 1,400 sqft",
        "image": "/illustrations/properties/villa-1.svg",
        "pincode": "500039",
        "furnishing": "unfurnished",
        "status": "ready",
        "amenities": ["parking"],
        "age_years": 8,
    },
    {
        "id": "h4",
        "title": "Duplex House",
        "location": "Kharadi, Pune",
        "price": "₹1.05 Cr",
        "type": "House",
        "category": "houses",
        "meta": "3 bed · 2,000 sqft",
        "image": "/illustrations/properties/villa-2.svg",
        "pincode": "411014",
        "furnishing": "unfurnished",
        "status": "under_construction",
        "amenities": ["parking", "clubhouse", "garden"],
        "age_years": 0,
    },
    {
        "id": "h5",
        "title": "4 BHK Independent House",
        "location": "JP Nagar, Bengaluru",
        "price": "₹2.2 Cr",
        "type": "House",
        "category": "houses",
        "meta": "4 bed · 3,000 sqft",
        "image": "/illustrations/properties/villa-1.svg",
        "pincode": "560078",
        "furnishing": "furnished",
        "status": "ready",
        "amenities": ["parking", "security", "power_backup", "garden"],
        "age_years": 2,
    },
    {
        "id": "h6",
        "title": "Row House",
        "location": "Kompally, Hyderabad",
        "price": "₹92 L",
        "type": "House",
        "category": "houses",
        "meta": "3 bed · 1,750 sqft",
        "image": "/illustrations/properties/villa-2.svg",
        "pincode": "500100",
        "furnishing": "semi",
        "status": "ready",
        "amenities": ["parking", "security"],
        "age_years": 6,
    },
    {
        "id": "a1",
        "title": "2 BHK Apartment",
        "location": "Baner, Pune",
        "price": "₹78 L",
        "type": "Apartment",
        "category": "apartments",
        "meta": "2 bed · 1,120 sqft",
        "image": "/illustrations/properties/apartment-1.svg",
        "pincode": "411045",
        "furnishing": "semi",
        "status": "ready",
        "amenities": ["lift", "gym", "security", "power_backup"],
        "age_years": 4,
    },
    {
        "id": "a2",
        "title": "1 BHK Apartment",
        "location": "Wakad, Pune",
        "price": "₹54 L",
        "type": "Apartment",
        "category": "apartments",
        "meta": "1 bed · 640 sqft",
        "image": "/illustrations/properties/apartment-2.svg",
        "pincode": "411057",
        "furnishing": "furnished",
        "status": "ready",
        "amenities": ["lift", "security"],
        "age_years": 3,
    },
    {
        "id": "a3",
        "title": "3 BHK Apartment",
        "location": "Gachibowli, Hyderabad",
        "price": "₹1.2 Cr",
        "type": "Apartment",
        "category": "apartments",
        "meta": "3 bed · 1,750 sqft",
        "image": "/illustrations/properties/apartment-3.svg",
        "pincode": "500032",
        "furnishing": "unfurnished",
        "status": "under_construction",
        "amenities": ["lift", "gym", "swimming_pool", "clubhouse"],
        "age_years": 0,
    },
    {
        "id": "a4",
        "title": "2 BHK Apartment",
        "location": "Hinjewadi, Pune",
        "price": "₹66 L",
        "type": "Apartment",
        "category": "apartments",
        "meta": "2 bed · 980 sqft",
        "image": "/illustrations/properties/apartment-1.svg",
        "pincode": "411057",
        "furnishing": "semi",
        "status": "ready",
        "amenities": ["lift", "security", "power_backup"],
        "age_years": 5,
    },
    {
        "id": "a5",
        "title": "3 BHK Apartment",
        "location": "Miyapur, Hyderabad",
        "price": "₹92 L",
        "type": "Apartment",
        "category": "apartments",
        "meta": "3 bed · 1,450 sqft",
        "image": "/illustrations/properties/apartment-2.svg",
        "pincode": "500049",
        "furnishing": "furnished",
        "status": "ready",
        "amenities": ["lift", "gym", "security"],
        "age_years": 7,
    },
    {
        "id": "a6",
        "title": "2 BHK Apartment",
        "location": "Electronic City, Bengaluru",
        "price": "₹58 L",
        "type": "Apartment",
        "category": "apartments",
        "meta": "2 bed · 1,050 sqft",
        "image": "/illustrations/properties/apartment-3.svg",
        "pincode": "560100",
        "furnishing": "unfurnished",
        "status": "under_construction",
        "amenities": ["lift", "swimming_pool", "clubhouse", "kids_play_area"],
        "age_years": 0,
    },
    {
        "id": "v1",
        "title": "3 BHK Villa",
        "location": "Whitefield, Bengaluru",
        "price": "₹1.6 Cr",
        "type": "Villa",
        "category": "villas",
        "meta": "3 bed · 2,400 sqft",
        "image": "/illustrations/properties/villa-1.svg",
        "pincode": "560066",
        "furnishing": "furnished",
        "status": "ready",
        "amenities": ["parking", "swimming_pool", "clubhouse", "garden", "security"],
        "age_years": 4,
    },
    {
        "id": "v2",
        "title": "4 BHK Villa",
        "location": "Kompally, Hyderabad",
        "price": "₹2.1 Cr",
        "type": "Villa",
        "category": "villas",
        "meta": "4 bed · 3,200 sqft",
        "image": "/illustrations/properties/villa-2.svg",
        "pincode": "500100",
        "furnishing": "semi",
        "status": "ready",
        "amenities": ["parking", "security", "power_backup", "garden"],
        "age_years": 2,
    },
    {
        "id": "v4",
        "title": "3 BHK Villa",
        "location": "Tellapur, Hyderabad",
        "price": "₹1.8 Cr",
        "type": "Villa",
        "category": "villas",
        "meta": "3 bed · 2,650 sqft",
        "image": "/illustrations/properties/villa-1.svg",
        "pincode": "502032",
        "furnishing": "unfurnished",
        "status": "under_construction",
        "amenities": ["parking", "clubhouse", "swimming_pool"],
        "age_years": 0,
    },
    {
        "id": "v5",
        "title": "4 BHK Villa",
        "location": "Sarjapur Road, Bengaluru",
        "price": "₹2.4 Cr",
        "type": "Villa",
        "category": "villas",
        "meta": "4 bed · 3,500 sqft",
        "image": "/illustrations/properties/villa-2.svg",
        "pincode": "560035",
        "furnishing": "furnished",
        "status": "ready",
        "amenities": ["parking", "swimming_pool", "security", "garden", "gym"],
        "age_years": 3,
    },
    {
        "id": "p1",
        "title": "Residential Plot",
        "location": "Shankarpally, Hyderabad",
        "price": "₹42 L",
        "type": "Plot",
        "category": "plots",
        "meta": "200 sq yd",
        "image": "/illustrations/properties/plot-1.svg",
        "pincode": "501203",
        "furnishing": "unfurnished",
        "status": "ready",
        "amenities": ["security"],
        "age_years": 0,
    },
    {
        "id": "p2",
        "title": "Farm Land",
        "location": "Chevella, Telangana",
        "price": "₹28 L",
        "type": "Land",
        "category": "plots",
        "meta": "1 acre",
        "image": "/illustrations/properties/plot-2.svg",
        "pincode": "501503",
        "furnishing": "unfurnished",
        "status": "ready",
        "amenities": [],
        "age_years": 0,
    },
    {
        "id": "p3",
        "title": "Corner Plot",
        "location": "Sarjapur, Bengaluru",
        "price": "₹65 L",
        "type": "Plot",
        "category": "plots",
        "meta": "300 sq yd",
        "image": "/illustrations/properties/plot-3.svg",
        "pincode": "562125",
        "furnishing": "unfurnished",
        "status": "ready",
        "amenities": ["security"],
        "age_years": 0,
    },
    {
        "id": "p4",
        "title": "Residential Plot",
        "location": "Mokila, Hyderabad",
        "price": "₹38 L",
        "type": "Plot",
        "category": "plots",
        "meta": "167 sq yd",
        "image": "/illustrations/properties/plot-1.svg",
        "pincode": "501203",
        "furnishing": "unfurnished",
        "status": "ready",
        "amenities": [],
        "age_years": 0,
    },
    {
        "id": "p5",
        "title": "Gated Community Plot",
        "location": "Maheshwaram, Hyderabad",
        "price": "₹52 L",
        "type": "Plot",
        "category": "plots",
        "meta": "267 sq yd",
        "image": "/illustrations/properties/plot-2.svg",
        "pincode": "501510",
        "furnishing": "unfurnished",
        "status": "ready",
        "amenities": ["security", "clubhouse"],
        "age_years": 0,
    },
    {
        "id": "p6",
        "title": "Residential Plot",
        "location": "Devanahalli, Bengaluru",
        "price": "₹48 L",
        "type": "Plot",
        "category": "plots",
        "meta": "150 sq yd",
        "image": "/illustrations/properties/plot-3.svg",
        "pincode": "562110",
        "furnishing": "unfurnished",
        "status": "ready",
        "amenities": [],
        "age_years": 0,
    },
    {
        "id": "c1",
        "title": "Commercial Shop",
        "location": "Kukatpally, Hyderabad",
        "price": "₹95 L",
        "type": "Shop",
        "category": "commercial",
        "meta": "650 sqft",
        "image": "/illustrations/properties/commercial-1.svg",
        "pincode": "500072",
        "furnishing": "unfurnished",
        "status": "ready",
        "amenities": ["parking", "security"],
        "age_years": 6,
    },
    {
        "id": "c2",
        "title": "Office Space",
        "location": "Baner, Pune",
        "price": "₹1.1 Cr",
        "type": "Office",
        "category": "commercial",
        "meta": "1,200 sqft",
        "image": "/illustrations/properties/commercial-2.svg",
        "pincode": "411045",
        "furnishing": "furnished",
        "status": "ready",
        "amenities": ["parking", "lift", "power_backup", "security"],
        "age_years": 4,
    },
    {
        "id": "c3",
        "title": "Retail Showroom",
        "location": "Madhapur, Hyderabad",
        "price": "₹1.8 Cr",
        "type": "Showroom",
        "category": "commercial",
        "meta": "1,800 sqft",
        "image": "/illustrations/properties/commercial-3.svg",
        "pincode": "500081",
        "furnishing": "semi",
        "status": "ready",
        "amenities": ["parking", "security"],
        "age_years": 5,
    },
    {
        "id": "c4",
        "title": "Office Space",
        "location": "HITEC City, Hyderabad",
        "price": "₹2.6 Cr",
        "type": "Office",
        "category": "commercial",
        "meta": "2,400 sqft",
        "image": "/illustrations/properties/commercial-1.svg",
        "pincode": "500081",
        "furnishing": "unfurnished",
        "status": "under_construction",
        "amenities": ["parking", "lift", "power_backup"],
        "age_years": 0,
    },
    {
        "id": "c5",
        "title": "Commercial Shop",
        "location": "Viman Nagar, Pune",
        "price": "₹85 L",
        "type": "Shop",
        "category": "commercial",
        "meta": "520 sqft",
        "image": "/illustrations/properties/commercial-2.svg",
        "pincode": "411014",
        "furnishing": "unfurnished",
        "status": "ready",
        "amenities": ["parking"],
        "age_years": 3,
    },
    {
        "id": "c6",
        "title": "Warehouse Unit",
        "location": "Medchal, Hyderabad",
        "price": "₹1.4 Cr",
        "type": "Warehouse",
        "category": "commercial",
        "meta": "4,000 sqft",
        "image": "/illustrations/properties/commercial-3.svg",
        "pincode": "501401",
        "furnishing": "unfurnished",
        "status": "ready",
        "amenities": ["parking", "security", "power_backup"],
        "age_years": 7,
    },
]


def _parse_location(location: str) -> tuple[str, str]:
    parts = [p.strip() for p in location.split(",")]
    locality = parts[0] if parts else location
    city = parts[1] if len(parts) > 1 else locality
    return locality, city


def _parse_bhk(meta: str | None) -> int:
    m = re.match(r"^(\d+)\s*bed", meta or "", re.IGNORECASE)
    return int(m.group(1)) if m else 0


def _parse_area_sqft(meta: str | None) -> int:
    if not meta:
        return 0
    sqft = re.search(r"([\d,]+)\s*sqft", meta, re.IGNORECASE)
    if sqft:
        return int(sqft.group(1).replace(",", ""))
    sq_yd = re.search(r"([\d,]+)\s*sq\s*yd", meta, re.IGNORECASE)
    if sq_yd:
        return round(int(sq_yd.group(1).replace(",", "")) * 9)
    acre = re.search(r"([\d.]+)\s*acre", meta, re.IGNORECASE)
    if acre:
        return round(float(acre.group(1)) * 43560)
    return 0


def _price_paise(display: str) -> int:
    m = re.search(r"₹([\d.]+)\s*(L|Cr)", display, re.IGNORECASE)
    if not m:
        return 0
    value = float(m.group(1))
    lakhs = value * 100 if m.group(2).lower() == "cr" else value
    # lakhs → rupees (×100_000) → paise (×100)
    return round(lakhs * 10_000_000)


async def _seed() -> None:
    from sqlalchemy import func, select

    import app.db.session as session_mod
    from app.models.property import Property

    async with session_mod.AsyncSessionLocal() as db:
        existing = await db.scalar(select(func.count()).select_from(Property))
        if existing:
            print(f"[seed_properties] {existing} propertie(s) already present — skipping.")
            return

        rows: list[Property] = []
        for i, raw in enumerate(_RAW, start=1):
            locality, city = _parse_location(raw["location"])
            rows.append(
                Property(
                    business_line="real_estate",
                    active=True,
                    title=raw["title"],
                    type=raw["type"],
                    location=raw["location"],
                    price_display=raw["price"],
                    meta=raw["meta"],
                    image=raw["image"],
                    category=raw["category"],
                    city=city,
                    locality=locality,
                    pincode=raw["pincode"],
                    price_paise=_price_paise(raw["price"]),
                    bhk=_parse_bhk(raw["meta"]),
                    area_sqft=_parse_area_sqft(raw["meta"]),
                    furnishing=raw["furnishing"],
                    construction_status=raw["status"],
                    amenities=raw["amenities"],
                    age_years=raw["age_years"],
                    rera_number=f"RERA/TS/2024/{i:04d}",
                    details={},
                )
            )
        db.add_all(rows)
        await db.commit()
        print(f"[seed_properties] Inserted {len(rows)} properties.")


def main() -> None:
    asyncio.run(_seed())


if __name__ == "__main__":
    main()
