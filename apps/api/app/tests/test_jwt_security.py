from datetime import UTC, datetime, timedelta

import jwt
import pytest
from jwt import PyJWTError as JWTError

from app.core.config import settings
from app.core.security import create_access_token, decode_access_token


def test_access_token_round_trip_preserves_claims_and_adds_session_metadata() -> None:
    token = create_access_token(
        {"sub": "jwt-regression-user", "role": "client", "business_line": "loans"}
    )

    claims = decode_access_token(token)

    assert claims["sub"] == "jwt-regression-user"
    assert claims["role"] == "client"
    assert claims["business_line"] == "loans"
    assert isinstance(claims["jti"], str)
    assert isinstance(claims["iat"], int)
    assert isinstance(claims["exp"], int)


def test_access_token_decode_rejects_expired_tokens() -> None:
    token = create_access_token(
        {"sub": "jwt-regression-user"},
        expires_delta=timedelta(seconds=-1),
    )

    with pytest.raises(JWTError):
        decode_access_token(token)


def test_access_token_decode_rejects_wrong_signature() -> None:
    token = jwt.encode(
        {
            "sub": "jwt-regression-user",
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        f"{settings.SECRET_KEY}-wrong",
        algorithm=settings.ALGORITHM,
    )

    with pytest.raises(JWTError):
        decode_access_token(token)


def test_access_token_decode_rejects_malformed_token() -> None:
    with pytest.raises(JWTError):
        decode_access_token("not-a-jwt")
