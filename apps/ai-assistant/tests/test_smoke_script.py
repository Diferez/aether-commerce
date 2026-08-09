from pathlib import Path


def test_smoke_script_uses_expected_endpoints() -> None:
    script = (Path(__file__).resolve().parents[1] / "scripts" / "smoke.py").read_text(encoding="utf-8")
    assert "/healthz" in script
    assert "/readyz" in script
    assert "/metrics" in script
    assert "ai_requests_total" in script
    assert "AETHER_AI_URL" in script


def test_dockerfile_keeps_runtime_non_root_and_healthchecked() -> None:
    dockerfile = (Path(__file__).resolve().parents[1] / "Dockerfile").read_text(encoding="utf-8")
    assert "FROM python:3.12-slim" in dockerfile
    assert "adduser --system" in dockerfile
    assert "USER aether" in dockerfile
    assert "HEALTHCHECK" in dockerfile
    assert "/healthz" in dockerfile


def test_compose_exposes_local_dependencies_and_healthcheck() -> None:
    compose = (Path(__file__).resolve().parents[1] / "docker-compose.yml").read_text(encoding="utf-8")
    assert "postgres:16-alpine" in compose
    assert "redis:7-alpine" in compose
    assert "DATABASE_URL" in compose
    assert "REDIS_URL" in compose
    assert "AI_CORS_ALLOWED_ORIGINS" in compose
    assert "healthcheck" in compose


def test_acceptance_audit_reports_artifacts_and_current_status() -> None:
    import importlib.util

    script = Path(__file__).resolve().parents[1] / "scripts" / "acceptance_audit.py"
    spec = importlib.util.spec_from_file_location("acceptance_audit", script)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    report = module.build_report()
    assert report["status"] == "passed"
    assert report["evaluation_cases"] >= 100
    assert report["missing_required_artifacts"] == []
    assert "Docker image build and container smoke test" not in report["active_production_blockers"]
    assert "repository secrets are still missing" not in report["active_production_blockers"]
    assert "NEXT_PUBLIC_AETHER_AI_URL" not in report["active_production_blockers"]
    assert "Production deployment of the AI assistant service has not been proven" not in report["active_production_blockers"]
