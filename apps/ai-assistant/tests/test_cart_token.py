import base64
import hashlib
import hmac
import json
import time

from app.cart_token import verify_cart_token


def sign(secret: str, payload: dict[str, object]) -> str:
    encoded_payload = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii").rstrip("=")
    signature = hmac.new(secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{encoded_payload}.{encoded_signature}"


def test_verify_cart_token_accepts_matching_cart() -> None:
    token = sign("secret", {"cartId": "cart-1", "exp": int(time.time()) + 60})
    assert verify_cart_token(token, "secret", "cart-1")


def test_verify_cart_token_rejects_wrong_cart() -> None:
    token = sign("secret", {"cartId": "cart-1", "exp": int(time.time()) + 60})
    assert not verify_cart_token(token, "secret", "cart-2")


def test_verify_cart_token_rejects_expired_token() -> None:
    token = sign("secret", {"cartId": "cart-1", "exp": int(time.time()) - 60})
    assert not verify_cart_token(token, "secret", "cart-1")
