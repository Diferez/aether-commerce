from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
ASSISTANT = ROOT / "apps" / "ai-assistant"
DOCS = ROOT / "docs" / "ai-assistant"


REQUIRED_DOCS = [
    "architecture-analysis.md",
    "architecture.md",
    "security.md",
    "tools.md",
    "api.md",
    "evaluation.md",
    "deployment.md",
    "runbook.md",
    "requirements-audit.md",
    "adr/0001-decoupled-python-assistant.md",
    "acceptance-status.md",
]

REQUIRED_SERVICE_FILES = [
    "app/main.py",
    "app/graph.py",
    "app/schemas.py",
    "app/tools.py",
    "app/clients/aether.py",
    "app/llm/provider.py",
    "app/storage.py",
    "app/rate_limit.py",
    "app/security.py",
    "migrations/0001_initial.sql",
    "Dockerfile",
    "docker-compose.yml",
    "scripts/smoke.py",
    "scripts/security_scan.py",
]

REQUIRED_FRONTEND_FILES = [
    "apps/storefront/components/AssistantWidget.tsx",
    ".github/workflows/ai-assistant-image.yml",
]

REQUIRED_TEST_FILES = [
    "tests/run_direct.py",
    "tests/test_api_smoke.py",
    "tests/test_graph_cart.py",
    "tests/test_security.py",
    "tests/test_evaluation.py",
    "tests/test_contracts_observability.py",
    "tests/test_acceptance_docs.py",
]


def _exists_nonempty(path: Path) -> bool:
    return path.exists() and path.is_file() and bool(path.read_text(encoding="utf-8").strip())


def _count_jsonl(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def _section(markdown: str, heading: str) -> str:
    marker = f"\n## {heading}\n"
    start = markdown.find(marker)
    if start == -1:
        return ""
    start += len(marker)
    next_heading = markdown.find("\n## ", start)
    if next_heading == -1:
        return markdown[start:]
    return markdown[start:next_heading]


def build_report() -> dict[str, object]:
    missing: list[str] = []

    for relative in REQUIRED_DOCS:
        if not _exists_nonempty(DOCS / relative):
            missing.append(f"docs/ai-assistant/{relative}")

    for relative in REQUIRED_SERVICE_FILES:
        if not _exists_nonempty(ASSISTANT / relative):
            missing.append(f"apps/ai-assistant/{relative}")

    for relative in REQUIRED_FRONTEND_FILES:
        if not _exists_nonempty(ROOT / relative):
            missing.append(relative)

    for relative in REQUIRED_TEST_FILES:
        if not _exists_nonempty(ASSISTANT / relative):
            missing.append(f"apps/ai-assistant/{relative}")

    dataset_cases = _count_jsonl(ASSISTANT / "evaluation" / "cases.jsonl")
    if dataset_cases < 100:
        missing.append("apps/ai-assistant/evaluation/cases.jsonl >= 100 cases")

    acceptance_status = (DOCS / "acceptance-status.md").read_text(encoding="utf-8")
    pending_evidence = _section(acceptance_status, "Pending Evidence Before Marking Complete")
    known_blockers = [
        "Docker image build and container smoke test",
        "repository secrets are still missing",
        "Real Gemini model availability was not verified",
        "NEXT_PUBLIC_AETHER_AI_URL",
        "GHCR image publication has not been proven",
        "Limited LangChain/Gemini classifier evaluation still timed out",
        "Staging deployment of the AI assistant service has not been proven",
        "Production deployment of the AI assistant service has not been proven",
        "Full acceptance needs one final requirement-by-requirement audit",
        "Re-run this audit after environment-backed evidence exists",
    ]
    active_blockers = [blocker for blocker in known_blockers if blocker in pending_evidence]

    return {
        "status": "blocked" if missing or active_blockers else "passed",
        "missing_required_artifacts": missing,
        "evaluation_cases": dataset_cases,
        "active_production_blockers": active_blockers,
    }


def main() -> int:
    report = build_report()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if report["missing_required_artifacts"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
