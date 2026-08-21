"""Typed, allowlisted definitions for Admin-configured client intake forms.

The database stores these definitions as JSONB, but callers never submit an
arbitrary JSON shape.  This module is the single contract for the form builder,
the client renderer, and server-side answer validation.
"""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, Field, model_validator


class ProductCategory(StrEnum):
    LOAN = "loan"
    CREDIT_CARD = "credit_card"
    INSURANCE = "insurance"


class FormInputType(StrEnum):
    TEXT = "text"
    TEXTAREA = "textarea"
    DATE = "date"
    INTEGER = "integer"
    CURRENCY = "currency"
    SELECT = "select"
    MULTI_SELECT = "multi_select"
    PINCODE = "pincode"
    PHONE = "phone"


class FormOption(BaseModel):
    value: Annotated[str, Field(min_length=1, max_length=80, pattern=r"^[a-z0-9][a-z0-9_-]*$")]
    label: Annotated[str, Field(min_length=1, max_length=120)]


class FormCondition(BaseModel):
    field_key: Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")]
    equals: Annotated[str, Field(min_length=1, max_length=80)]


class FormFieldDefinition(BaseModel):
    key: Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")]
    label: Annotated[str, Field(min_length=1, max_length=120)]
    input_type: FormInputType
    required: bool = True
    options: Annotated[list[FormOption], Field(max_length=30)] = Field(default_factory=list)
    placeholder: Annotated[str | None, Field(default=None, max_length=120)] = None
    help_text: Annotated[str | None, Field(default=None, max_length=240)] = None
    condition: FormCondition | None = None

    @model_validator(mode="after")
    def _options_match_input_type(self) -> FormFieldDefinition:
        option_input = self.input_type in (FormInputType.SELECT, FormInputType.MULTI_SELECT)
        if option_input and not self.options:
            raise ValueError("Select fields must provide at least one option.")
        if not option_input and self.options:
            raise ValueError("Only select fields may provide options.")
        values = [option.value for option in self.options]
        if len(values) != len(set(values)):
            raise ValueError("Field options must use unique values.")
        return self


class FormSectionDefinition(BaseModel):
    key: Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")]
    title: Annotated[str, Field(min_length=1, max_length=120)]
    description: Annotated[str | None, Field(default=None, max_length=240)] = None
    fields: Annotated[list[FormFieldDefinition], Field(min_length=1, max_length=30)]


class ProductFormDefinition(BaseModel):
    sections: Annotated[list[FormSectionDefinition], Field(min_length=1, max_length=10)]

    @model_validator(mode="after")
    def _validate_topology(self) -> ProductFormDefinition:
        section_keys = [section.key for section in self.sections]
        if len(section_keys) != len(set(section_keys)):
            raise ValueError("Form sections must use unique keys.")

        fields = [field for section in self.sections for field in section.fields]
        if len(fields) > 100:
            raise ValueError("A form may contain at most 100 fields.")
        field_keys = [field.key for field in fields]
        if len(field_keys) != len(set(field_keys)):
            raise ValueError("Form fields must use unique keys.")

        seen: dict[str, FormFieldDefinition] = {}
        for field in fields:
            if field.condition is not None:
                source = seen.get(field.condition.field_key)
                if source is None:
                    raise ValueError("Conditional fields must follow their controlling field.")
                if source.input_type != FormInputType.SELECT:
                    raise ValueError("A conditional field must be controlled by a select field.")
                if field.condition.equals not in {option.value for option in source.options}:
                    raise ValueError(
                        "A condition must match one of the controlling field's options."
                    )
            seen[field.key] = field
        return self

    def fields(self) -> list[FormFieldDefinition]:
        return [field for section in self.sections for field in section.fields]


FormAnswer = str | list[str]
FormAnswers = dict[str, FormAnswer]


class FormAnswersValidationError(ValueError):
    """A client answer set does not match the currently published form."""


def _is_active(field: FormFieldDefinition, answers: FormAnswers) -> bool:
    if field.condition is None:
        return True
    return answers.get(field.condition.field_key) == field.condition.equals


def _validate_string(field: FormFieldDefinition, raw: object) -> str:
    if not isinstance(raw, str):
        raise FormAnswersValidationError(f"{field.label} must be text.")
    value = raw.strip()
    max_length = 2000 if field.input_type == FormInputType.TEXTAREA else 200
    if len(value) > max_length:
        raise FormAnswersValidationError(f"{field.label} is too long.")
    if not value:
        return value

    if field.input_type == FormInputType.PINCODE and re.fullmatch(r"[1-9][0-9]{5}", value) is None:
        raise FormAnswersValidationError(f"{field.label} must be a valid 6-digit pincode.")
    if field.input_type == FormInputType.PHONE and re.fullmatch(r"[6-9][0-9]{9}", value) is None:
        raise FormAnswersValidationError(f"{field.label} must be a valid 10-digit mobile number.")
    if field.input_type == FormInputType.INTEGER and (
        re.fullmatch(r"[0-9]+", value) is None or int(value) > 999999999
    ):
        raise FormAnswersValidationError(f"{field.label} must be a valid whole number.")
    if field.input_type == FormInputType.CURRENCY:
        try:
            amount = Decimal(value)
        except InvalidOperation as exc:
            raise FormAnswersValidationError(f"{field.label} must be a valid amount.") from exc
        if (
            not amount.is_finite()
            or amount <= 0
            or amount > Decimal("999999999999.99")
            or amount.as_tuple().exponent < -2
        ):
            raise FormAnswersValidationError(f"{field.label} must be a valid positive amount.")
        value = format(amount.quantize(Decimal("0.01")), "f")
    if field.input_type == FormInputType.DATE:
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise FormAnswersValidationError(f"{field.label} must be a valid date.") from exc
        if field.key.endswith("date_of_birth"):
            today = date.today()
            age = today.year - parsed.year - ((today.month, today.day) < (parsed.month, parsed.day))
            if age < 18 or age > 100:
                raise FormAnswersValidationError(
                    f"{field.label} must correspond to an age between 18 and 100."
                )
    if field.input_type == FormInputType.SELECT and value not in {
        option.value for option in field.options
    }:
        raise FormAnswersValidationError(f"Choose a valid option for {field.label}.")
    return value


def validate_form_answers(definition: ProductFormDefinition, answers: FormAnswers) -> FormAnswers:
    """Return trimmed, normalized answers or raise a user-safe validation error."""
    fields = definition.fields()
    known_keys = {field.key for field in fields}
    unexpected = set(answers) - known_keys
    if unexpected:
        raise FormAnswersValidationError("The form contains fields that are no longer available.")

    normalized: FormAnswers = {}
    for field in fields:
        active = _is_active(field, {**answers, **normalized})
        supplied = field.key in answers
        if not active:
            if supplied:
                raise FormAnswersValidationError(f"{field.label} is not applicable.")
            continue
        if not supplied:
            if field.required:
                raise FormAnswersValidationError(f"{field.label} is required.")
            continue

        raw = answers[field.key]
        if field.input_type == FormInputType.MULTI_SELECT:
            if (
                not isinstance(raw, list)
                or len(raw) > 10
                or any(not isinstance(v, str) for v in raw)
            ):
                raise FormAnswersValidationError(f"Choose valid options for {field.label}.")
            allowed = {option.value for option in field.options}
            values = list(dict.fromkeys(value.strip() for value in raw if value.strip()))
            if any(value not in allowed for value in values):
                raise FormAnswersValidationError(f"Choose valid options for {field.label}.")
            if field.required and not values:
                raise FormAnswersValidationError(f"{field.label} is required.")
            normalized[field.key] = values
            continue

        value = _validate_string(field, raw)
        if field.required and not value:
            raise FormAnswersValidationError(f"{field.label} is required.")
        if value:
            normalized[field.key] = value
    departure = normalized.get("departure_date")
    return_date = normalized.get("return_date")
    if isinstance(departure, str) and isinstance(return_date, str) and departure > return_date:
        raise FormAnswersValidationError("Return Date must be on or after Departure Date.")
    return normalized


def ensure_category_form(category: ProductCategory, definition: ProductFormDefinition) -> None:
    """Apply category-level invariants that a generic form model cannot know."""
    fields = {field.key: field for field in definition.fields()}
    requested_amount = fields.get("requested_amount")
    if category == ProductCategory.LOAN and (
        requested_amount is None
        or requested_amount.input_type != FormInputType.CURRENCY
        or not requested_amount.required
        or requested_amount.condition is not None
    ):
        raise ValueError(
            "Loan forms require an unconditional required currency field named requested_amount."
        )
