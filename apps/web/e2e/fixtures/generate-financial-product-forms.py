"""Export public, frozen seed definitions for the synthetic Admin browser suite.

Run with the repository API Python environment from any working directory.
No database, customer records, environment files or provider data are read.
"""

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
VERSIONS = ROOT / "apps" / "api" / "alembic" / "versions"


def load(filename):
    spec = importlib.util.spec_from_file_location("fixture_seed", VERSIONS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


seed = load("f6a7b8c9d0e1_configurable_financial_product_forms.py")
overdraft = load("e2a4c6f8b0d3_add_overdraft_product_form.py")
products = [
    {
        "name": product["name"],
        "label": product["label"],
        "category": product["category"],
        "display_order": product["order"],
        "form_schema": product["form"],
    }
    for product in seed._products()
]
products.append({
    "name": "od-and-dod",
    "label": "OD and DOD",
    "category": "loan",
    "display_order": 17,
    "form_schema": overdraft.FORM,
})
# Match the API's explicit optional defaults in the browser fixture.
for product in products:
    for section in product["form_schema"]["sections"]:
        section.setdefault("description", None)
        for field in section["fields"]:
            field.setdefault("required", True)
            field.setdefault("options", [])
            for key in ("placeholder", "help_text", "condition"):
                field.setdefault(key, None)
Path(__file__).with_name("financial-product-forms.json").write_text(
    json.dumps(products, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"Exported {len(products)} frozen form definitions.")
