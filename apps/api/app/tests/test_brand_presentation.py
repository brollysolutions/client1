"""Branding must not change data, activate input HTML/formulas, or send email."""

import io
import zipfile
from email import policy
from email.parser import BytesParser
from xml.etree import ElementTree as ET

import pytest

from app.api.v1.reporting import _csv_chunks, _export_filename, _xlsx_response
from app.core.brand import LOGO_PNG
from app.services.email import branded_email, send_email


@pytest.mark.parametrize("truncated", [False, True])
@pytest.mark.parametrize("rows", [[], [{"name": "=1+1", "amount": 123.45, "active": True}]])
def test_branded_workbook_preserves_cells_and_embeds_local_logo(rows, truncated):
    response = _xlsx_response(rows, ["name", "amount", "active"], truncated, "report.xlsx")
    with zipfile.ZipFile(io.BytesIO(response.body)) as archive:
        assert archive.read("xl/media/image1.png") == LOGO_PNG
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        assert sheet.find(".//s:pane", ns).attrib["ySplit"] == "7"
        assert sheet.find(".//s:c[@r='A7']", ns) is not None
        assert sheet.find(".//s:f", ns) is None
        if rows:
            assert sheet.find(".//s:c[@r='B8']/s:v", ns).text == "123.45"
            assert sheet.find(".//s:c[@r='C8']", ns).attrib["t"] == "b"
            assert b"'=1+1" in archive.read("xl/sharedStrings.xml")
    assert (response.headers.get("X-Report-Truncated") == "true") is truncated


def test_csv_keeps_first_row_and_formula_defense():
    text = b"".join(_csv_chunks([{"name": "=1+1", "amount": 2}], ["name", "amount"]))
    assert text.decode("utf-8-sig") == "name,amount\r\n'=1+1,2\r\n"
    from datetime import date

    assert _export_filename("leads", "loans", date(2032, 1, 1), date(2032, 1, 2)).startswith(
        "dhanadhara-leads-loans-"
    )


def test_email_has_escaped_html_plaintext_and_embedded_logo():
    body = '<script>alert(1)</script> & "private"\nhttps://example.com/dashboard'
    message = branded_email("recipient@example.com", "<b>Update</b>", body)
    parsed = BytesParser(policy=policy.default).parsebytes(message.as_bytes())
    assert parsed.get_body(preferencelist=("plain",)).get_content().rstrip() == body
    html = parsed.get_body(preferencelist=("html",)).get_content()
    assert "<script>" not in html and "<b>Update</b>" not in html
    assert "&lt;script&gt;" in html and "&lt;b&gt;Update&lt;/b&gt;" in html
    assert 'src="cid:dhanadhara-logo"' in html
    assert 'src="http' not in html
    image = next(part for part in parsed.walk() if part.get_content_type() == "image/png")
    assert image["Content-ID"] == "<dhanadhara-logo>"
    assert image.get_payload(decode=True) == LOGO_PNG


@pytest.mark.asyncio
async def test_email_mock_does_not_dispatch(monkeypatch):
    from app.services import email

    monkeypatch.setattr(email.settings, "EMAIL_ENABLED", False)

    async def forbidden(*args, **kwargs):
        raise AssertionError("Mock email must never contact SMTP")

    monkeypatch.setattr(email.aiosmtplib, "send", forbidden)
    assert await send_email("recipient@example.com", "Update", "Body") is False
