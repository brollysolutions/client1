"""Deterministic, synthetic credentials for the local demo dataset.

These values are intentionally public test fixtures, not secrets.  The writer
that uses them is hard-gated to ``ENV=development`` in ``seed_demo.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID, uuid5

DEMO_DATASET_VERSION = 1
DEMO_PASSWORD = "Demo@1234"
DEMO_NAMESPACE = UUID("43dc145e-b992-4f32-bfd8-a2747d96c00d")


@dataclass(frozen=True, slots=True)
class DemoAccount:
    key: str
    label: str
    first_name: str
    last_name: str
    mobile: str
    email: str
    role: str
    business_line: str | None


DEMO_ACCOUNTS: tuple[DemoAccount, ...] = (
    DemoAccount(
        "admin",
        "Admin",
        "Aarav",
        "Admin",
        "+919000001001",
        "admin.demo@example.com",
        "admin",
        None,
    ),
    DemoAccount(
        "admin_checker",
        "Admin (checker)",
        "Anika",
        "Admin",
        "+919000001002",
        "admin.checker.demo@example.com",
        "admin",
        None,
    ),
    DemoAccount(
        "sub_admin",
        "Sub Admin",
        "Sana",
        "Subadmin",
        "+919000001003",
        "subadmin.demo@example.com",
        "sub_admin",
        None,
    ),
    DemoAccount(
        "client",
        "Client (Loans + Real Estate)",
        "Charan",
        "Client",
        "+919000001004",
        "client.demo@example.com",
        "client",
        "both",
    ),
    DemoAccount(
        "client_referred",
        "Client (referred journey)",
        "Diya",
        "Client",
        "+919000001005",
        "client.referred.demo@example.com",
        "client",
        "both",
    ),
    DemoAccount(
        "agent_loans",
        "Agent (Loans)",
        "Laksh",
        "Agent",
        "+919000001006",
        "agent.loans.demo@example.com",
        "agent",
        "loans",
    ),
    DemoAccount(
        "agent_real_estate",
        "Agent (Real Estate)",
        "Riya",
        "Agent",
        "+919000001007",
        "agent.realestate.demo@example.com",
        "agent",
        "real_estate",
    ),
    DemoAccount(
        "telecaller_loans",
        "Telecaller (Loans)",
        "Tara",
        "Telecaller",
        "+919000001008",
        "telecaller.loans.demo@example.com",
        "telecaller",
        "loans",
    ),
    DemoAccount(
        "telecaller_real_estate",
        "Telecaller (Real Estate)",
        "Tejas",
        "Telecaller",
        "+919000001009",
        "telecaller.realestate.demo@example.com",
        "telecaller",
        "real_estate",
    ),
    DemoAccount(
        "employee_loans",
        "Employee (Loans)",
        "Esha",
        "Employee",
        "+919000001010",
        "employee.loans.demo@example.com",
        "employee",
        "loans",
    ),
    DemoAccount(
        "employee_real_estate",
        "Employee (Real Estate)",
        "Ishaan",
        "Employee",
        "+919000001011",
        "employee.realestate.demo@example.com",
        "employee",
        "real_estate",
    ),
)

DEMO_ACCOUNT_BY_KEY = {account.key: account for account in DEMO_ACCOUNTS}


def demo_uuid(key: str) -> UUID:
    """Return the stable UUID owned by this dataset for ``key``."""
    return uuid5(DEMO_NAMESPACE, f"v{DEMO_DATASET_VERSION}:{key}")


def credentials_table() -> str:
    """Render the complete credential roster without querying the database."""
    lines = [
        "Label | Mobile | Password | Business line",
        "--- | --- | --- | ---",
    ]
    for account in DEMO_ACCOUNTS:
        lines.append(
            f"{account.label} | {account.mobile} | {DEMO_PASSWORD} | "
            f"{account.business_line or 'platform'}"
        )
    return "\n".join(lines)
