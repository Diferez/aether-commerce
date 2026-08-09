import base64
import hashlib
import hmac
import json
import time
from typing import Any


def _base64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _base64url_hmac(secret: str, payload: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def verify_cart_token(token: str | None, secret: str, expected_cart_id: str | None) -> bool:
    if not token or not secret or not expected_cart_id:
        return False
    try:
        payload_b64, signature = token.split(".", 1)
        expected_signature = _base64url_hmac(secret, payload_b64)
        if not hmac.compare_digest(signature, expected_signature):
            return False
        payload: dict[str, Any] = json.loads(_base64url_decode(payload_b64))
        return payload.get("cartId") == expected_cart_id and int(payload.get("exp", 0)) >= int(time.time())
    except Exception:
        return False
