import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {
    ".data",
    ".mypy_cache",
    ".pytest_cache",
    "__pycache__",
    ".venv",
    "node_modules",
}
SKIP_SUFFIXES = {".pyc", ".sqlite3", ".db", ".log"}

SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("stripe_secret_key", re.compile(r"\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b")),
    ("stripe_webhook_secret", re.compile(r"\bwhsec_[A-Za-z0-9]{16,}\b")),
    ("google_api_key", re.compile(r"\bAIza[0-9A-Za-z_-]{20,}\b")),
    ("clerk_secret_key", re.compile(r"\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b")),
    ("github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{30,}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b")),
]


def iter_scannable_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune SKIP_DIRS before os.walk descends into them, so a broken
        # symlink/junction inside e.g. node_modules never gets scanned into.
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for filename in filenames:
            path = Path(dirpath) / filename
            if path.suffix in SKIP_SUFFIXES:
                continue
            files.append(path)
    return files


def scan_file(path: Path) -> list[str]:
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return []
    findings: list[str] = []
    display_path = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
    for name, pattern in SECRET_PATTERNS:
        if pattern.search(content):
            findings.append(f"{display_path}:{name}")
    return findings


def main() -> None:
    findings: list[str] = []
    for path in iter_scannable_files(ROOT):
        findings.extend(scan_file(path))
    if findings:
        print("security_scan_failed", file=sys.stderr)
        for finding in findings:
            print(finding, file=sys.stderr)
        raise SystemExit(1)
    print("security_scan_ok")


if __name__ == "__main__":
    main()
