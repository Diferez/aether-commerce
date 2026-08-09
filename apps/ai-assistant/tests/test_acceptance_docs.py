from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
ASSISTANT_DOCS = ROOT / "docs" / "ai-assistant"
README = ROOT / "README.md"
NESTED_CI = ROOT / ".github" / "workflows" / "ci.yml"
ROOT_CI = ROOT / ".github" / "workflows" / "ci.yml"
PRODUCTION_DEPLOY = ROOT / ".github" / "workflows" / "deploy-production.yml"
AI_IMAGE_WORKFLOW = ROOT / ".github" / "workflows" / "ai-assistant-image.yml"
ROOT_PACKAGE_JSON = ROOT / "package.json"
AETHER_PACKAGE_JSON = ROOT / "package.json"
DEPLOY_PREFLIGHT = ROOT / "scripts" / "check-deploy-config.mjs"
ENV_EXAMPLE = ROOT / "apps" / "ai-assistant" / ".env.example"
CONFIG = ROOT / "apps" / "ai-assistant" / "app" / "config.py"


def test_required_ai_assistant_documentation_exists() -> None:
    for relative_path in [
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
    ]:
        path = ASSISTANT_DOCS / relative_path
        assert path.exists(), f"Missing AI assistant document: {relative_path}"
        assert path.read_text(encoding="utf-8").strip(), f"Empty AI assistant document: {relative_path}"


def test_architecture_document_contains_required_mermaid_diagrams() -> None:
    architecture = (ASSISTANT_DOCS / "architecture.md").read_text(encoding="utf-8")

    assert architecture.count("```mermaid") >= 2
    for required_node in [
        "validate_request",
        "load_conversation_context",
        "detect_intent",
        "extract_constraints",
        "route_intent",
        "execute_authorized_tool",
        "validate_tool_result",
        "persist_audit_event",
    ]:
        assert required_node in architecture


def test_requirements_audit_tracks_verified_and_blocked_items() -> None:
    audit = (ASSISTANT_DOCS / "requirements-audit.md").read_text(encoding="utf-8").lower()

    for required_phrase in [
        "real gemini availability",
        "production deployment workflow",
        "docker image",
        "docker smoke runtime",
        "frontend integration",
        "response contract",
        "blocked",
        "verified",
        "production environment",
        "next_public_aether_ai_url",
    ]:
        assert required_phrase in audit


def test_readme_documents_ai_assistant_operations() -> None:
    readme = README.read_text(encoding="utf-8").lower()

    for required_phrase in [
        "apps/ai-assistant",
        "gemini_api_key",
        "database_url",
        "redis_url",
        "python -m app.migrate",
        "python tests/run_direct.py",
        "next_public_aether_ai_url",
        "ai_assistant_enabled",
        "ai gemini evaluation",
        "acceptance-status.md",
    ]:
        assert required_phrase in readme


def test_deploy_preflight_checks_required_github_config() -> None:
    root_package = ROOT_PACKAGE_JSON.read_text(encoding="utf-8").lower()
    aether_package = AETHER_PACKAGE_JSON.read_text(encoding="utf-8").lower()
    preflight = DEPLOY_PREFLIGHT.read_text(encoding="utf-8").lower()
    deployment = (ASSISTANT_DOCS / "deployment.md").read_text(encoding="utf-8").lower()

    assert "deploy:preflight" in root_package
    assert "scripts/check-deploy-config.mjs" in root_package
    assert "deploy:preflight" in aether_package
    assert "scripts/check-deploy-config.mjs" in aether_package
    assert "deploy_config_ok" in preflight
    for required_name in [
        "cloudflare_deploy_enabled",
        "aether_d1_database_id",
        "next_public_aether_api_url",
        "next_public_portfolio_url",
        "app_origin_admin",
        "cloudflare_api_token",
        "cloudflare_account_id",
        "next_public_aether_ai_url",
        "app_origin_store",
        "next_public_clerk_publishable_key",
    ]:
        assert required_name in preflight
        assert required_name in deployment


def test_ci_documents_minimum_assistant_pipeline_gates() -> None:
    combined_ci = "\n".join(
        [
            NESTED_CI.read_text(encoding="utf-8").lower(),
            ROOT_CI.read_text(encoding="utf-8").lower(),
        ]
    )

    for required_gate in [
        "typecheck",
        "lint",
        "unit and contract tests",
        "security_scan.py",
        "acceptance_audit.py",
        "docker build",
        "smoke.py",
        "openapi",
        "build",
        "test:e2e:assistant",
    ]:
        assert required_gate in combined_ci

    assert "app.gemini_evaluation" not in combined_ci


def test_ai_assistant_image_workflow_builds_smokes_and_publishes() -> None:
    workflow = AI_IMAGE_WORKFLOW.read_text(encoding="utf-8").lower()

    for required_phrase in [
        "ghcr.io",
        "docker build",
        "python scripts/smoke.py",
        "docker/login-action",
        "docker push",
        "${github_sha}",
        ":latest",
    ]:
        assert required_phrase in workflow


def test_production_workflow_smokes_ai_assistant_image_before_deploy() -> None:
    deploy = PRODUCTION_DEPLOY.read_text(encoding="utf-8").lower()
    settings_index = deploy.index("verify deployment settings")
    api_index = deploy.index("deploy api worker")
    assistant_index = deploy.index("deploy ai assistant worker")
    storefront_index = deploy.index("deploy storefront worker")

    assert settings_index < api_index < assistant_index < storefront_index
    assert "aether_cart_token_secret" in deploy
    assert "cloudflare_api_token" in deploy
    assert "cloudflare_account_id" in deploy


def test_required_environment_variables_are_documented_and_configured() -> None:
    env_example = ENV_EXAMPLE.read_text(encoding="utf-8")
    config = CONFIG.read_text(encoding="utf-8")

    required_env_vars = [
        "AETHER_API_BASE_URL",
        "AETHER_CART_TOKEN_SECRET",
        "AI_DEPLOYMENT_ENVIRONMENT",
        "GEMINI_API_KEY",
        "GEMINI_MODEL",
        "GEMINI_FALLBACK_MODEL",
        "GEMINI_TEMPERATURE",
        "GEMINI_MAX_OUTPUT_TOKENS",
        "AI_ASSISTANT_ENABLED",
        "AI_MUTATIONS_ENABLED",
        "AI_INTENT_CONFIDENCE_THRESHOLD",
        "AI_MUTATION_CONFIDENCE_THRESHOLD",
        "AI_MAX_GRAPH_STEPS",
        "AI_MAX_LLM_CALLS_PER_REQUEST",
        "AI_MAX_TOOL_CALLS_PER_REQUEST",
        "AI_MAX_PRODUCTS_PER_RESPONSE",
        "AI_MAX_CONVERSATION_MESSAGES",
        "AI_REQUEST_TIMEOUT_SECONDS",
        "AI_RATE_LIMIT_MESSAGES_PER_MINUTE",
        "AI_RATE_LIMIT_MESSAGES_PER_HOUR",
        "AI_RATE_LIMIT_ANONYMOUS_PER_DAY",
        "AI_RATE_LIMIT_AUTHENTICATED_PER_DAY",
        "AI_MAX_CONCURRENT_REQUESTS",
        "AI_MAX_INPUT_CHARACTERS",
        "AI_LOG_MESSAGE_CONTENT",
        "AI_REDACT_PII",
        "AI_STORE_CONVERSATIONS",
        "AI_CONVERSATION_RETENTION_DAYS",
        "AI_RUN_MIGRATIONS_ON_STARTUP",
        "AI_DAILY_REQUEST_BUDGET",
        "AI_OPERATIONS_TOKEN",
        "AI_CORS_ALLOWED_ORIGINS",
        "OTEL_ENABLED",
        "OTEL_SERVICE_NAME",
        "DATABASE_URL",
        "REDIS_URL",
    ]

    for env_var in required_env_vars:
        assert f"{env_var}=" in env_example, f"Missing {env_var} in .env.example"
        setting_name = env_var.lower()
        assert setting_name in config, f"Missing {setting_name} in Settings"
