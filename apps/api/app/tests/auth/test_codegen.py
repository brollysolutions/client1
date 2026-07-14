"""Unit tests for generate_profile_code (Auth Design §5 — Crockford base32).

No database or Redis required — pure function tests.
"""

from __future__ import annotations

import re

import pytest

from app.core.security import generate_profile_code

_CROCKFORD_CHARS = set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

# Regex captures: role_prefix, line_prefix (optional), code_chars, name_suffix (optional)
# Full format: {ROLE}-{LINE_PREFIX?}{CODE}{NAME?}
_CLIENT_LOAN_RE = re.compile(r"^CL-LN([0-9A-HJKMNP-TV-Z]{4})([A-Z]*)$")
_CLIENT_RE_RE = re.compile(r"^CL-RE([0-9A-HJKMNP-TV-Z]{4})([A-Z]*)$")
_AGENT_LOAN_RE = re.compile(r"^AG-LN([0-9A-HJKMNP-TV-Z]{4})([A-Z]*)$")
_STAFF_RE = re.compile(r"^(AD|SA|TC|EM)-([0-9A-HJKMNP-TV-Z]{4})([A-Z]*)$")


class TestClientCode:
    def test_loans_format(self) -> None:
        code = generate_profile_code("client", "John", "loans")
        assert _CLIENT_LOAN_RE.match(code), f"Bad format: {code}"

    def test_real_estate_format(self) -> None:
        code = generate_profile_code("client", "Priya", "real_estate")
        assert _CLIENT_RE_RE.match(code), f"Bad format: {code}"

    def test_code_segment_is_4_chars(self) -> None:
        code = generate_profile_code("client", "John", "loans")
        m = _CLIENT_LOAN_RE.match(code)
        assert m and len(m.group(1)) == 4

    def test_code_chars_are_crockford(self) -> None:
        code = generate_profile_code("client", "John", "loans")
        m = _CLIENT_LOAN_RE.match(code)
        assert m
        assert all(c in _CROCKFORD_CHARS for c in m.group(1))

    def test_name_uppercased_and_alpha_only(self) -> None:
        code = generate_profile_code("client", "r. suresh", "loans")
        m = _CLIENT_LOAN_RE.match(code)
        assert m
        assert m.group(2) == "RSUR"

    def test_name_capped_at_4(self) -> None:
        code = generate_profile_code("client", "Venkataramanasubramanian", "loans")
        m = _CLIENT_LOAN_RE.match(code)
        assert m
        assert len(m.group(2)) == 4

    def test_non_alpha_name_omitted(self) -> None:
        code = generate_profile_code("client", "123---", "loans")
        # name suffix should be empty — code ends right after the 4-char segment
        assert re.match(r"^CL-LN[0-9A-HJKMNP-TV-Z]{4}$", code), f"Bad format: {code}"

    def test_no_business_line_produces_no_line_prefix(self) -> None:
        code = generate_profile_code("client", "John")
        assert re.match(r"^CL-[0-9A-HJKMNP-TV-Z]{4}[A-Z]*$", code), f"Bad format: {code}"

    def test_uniqueness_across_100_calls(self) -> None:
        codes = {generate_profile_code("client", "John", "loans") for _ in range(100)}
        # 32^4 = 1,048,576-slot space; birthday paradox puts P(>=1 collision) at n=100
        # around 0.5% (n^2/2N), so a strict ==100 assertion flakes in CI on its own.
        # A broken/non-random generator would produce many dupes, not one — 99 still
        # catches that while tolerating the expected rare single collision.
        assert len(codes) >= 99


class TestStaffCode:
    @pytest.mark.parametrize(
        "role,prefix",
        [
            ("admin", "AD"),
            ("sub_admin", "SA"),
            ("telecaller", "TC"),
            ("employee", "EM"),
        ],
    )
    def test_staff_code_is_4_chars(self, role: str, prefix: str) -> None:
        # Empty name → no suffix → segment is exactly the 4-char code (no Crockford/name ambiguity)
        code = generate_profile_code(role, "")
        assert re.match(rf"^{prefix}-[0-9A-HJKMNP-TV-Z]{{4}}$", code), f"Bad format: {code}"


class TestAgentCode:
    def test_agent_loans_format(self) -> None:
        code = generate_profile_code("agent", "Ravi", "loans")
        assert _AGENT_LOAN_RE.match(code), f"Bad format: {code}"

    def test_agent_code_is_4_chars(self) -> None:
        code = generate_profile_code("agent", "", "loans")
        assert re.match(r"^AG-LN[0-9A-HJKMNP-TV-Z]{4}$", code), f"Bad format: {code}"

    def test_unknown_role_uses_xx_prefix(self) -> None:
        code = generate_profile_code("mystery_role", "John")
        assert code.startswith("XX-"), f"Bad fallback prefix: {code}"
