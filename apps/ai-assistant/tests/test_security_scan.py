from pathlib import Path

from app.security import stable_hash


def load_security_scan():
    import importlib.util

    script = Path(__file__).resolve().parents[1] / "scripts" / "security_scan.py"
    spec = importlib.util.spec_from_file_location("security_scan", script)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load security_scan.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_security_scan_detects_secret_like_values(tmp_path: Path) -> None:
    scanner = load_security_scan()
    secret_file = tmp_path / "leak.txt"
    fake_secret = "sk" + "_test_" + "1234567890abcdefghijklmnop"
    secret_file.write_text(f"STRIPE_SECRET_KEY={fake_secret}", encoding="utf-8")

    findings = scanner.scan_file(secret_file)

    assert any("stripe_secret_key" in finding for finding in findings)


def test_security_scan_allows_empty_placeholders(tmp_path: Path) -> None:
    scanner = load_security_scan()
    placeholder_file = tmp_path / ".env.example"
    placeholder_file.write_text("GEMINI_API_KEY=\nSTRIPE_SECRET_KEY=\n", encoding="utf-8")

    assert scanner.scan_file(placeholder_file) == []


def test_stable_hash_does_not_match_secret_patterns() -> None:
    scanner = load_security_scan()
    hashed_value = stable_hash("user_123")

    assert hashed_value
    for _, pattern in scanner.SECRET_PATTERNS:
        assert not pattern.search(hashed_value)
