import hashlib
import html
import re
from urllib.parse import urlparse
from uuid import uuid4


EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)")
CARD_RE = re.compile(r"\b(?:\d[ -]*?){13,19}\b")
HTML_TAG_RE = re.compile(r"<[^>]+>")
MARKDOWN_LINK_RE = re.compile(r"\[([^\]]{0,160})\]\((?:[^)]{0,400})\)")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b-\u200f\ufeff]")
WHITESPACE_RE = re.compile(r"\s+")


def redact_pii(value: str) -> str:
    value = CARD_RE.sub("[redacted-card]", value)
    value = EMAIL_RE.sub("[redacted-email]", value)
    value = PHONE_RE.sub("[redacted-phone]", value)
    return value


def sanitize_external_text(value: object, max_length: int = 500) -> str:
    text = "" if value is None else str(value)
    text = html.unescape(text)
    text = HTML_TAG_RE.sub(" ", text)
    text = MARKDOWN_LINK_RE.sub(r"\1", text)
    text = CONTROL_RE.sub("", text)
    text = redact_pii(text)
    text = WHITESPACE_RE.sub(" ", text).strip()
    if len(text) > max_length:
        return f"{text[: max_length - 3].rstrip()}..."
    return text


def sanitize_external_url(value: object) -> str | None:
    text = sanitize_external_text(value, 1000)
    if not text:
        return None
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return text


def stable_hash(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def request_id() -> str:
    return str(uuid4())


def idempotency_key(request_id_value: str, tool_name: str, normalized_arguments: str) -> str:
    digest = hashlib.sha256(f"{request_id_value}:{tool_name}:{normalized_arguments}".encode("utf-8")).hexdigest()
    return f"ai_{digest[:48]}"
