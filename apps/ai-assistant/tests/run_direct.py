import importlib.util
import pathlib
import sys
import tempfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def load_module(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    security = load_module("security_tests", "tests/test_security.py")
    storage = load_module("storage_tests", "tests/test_storage_rate_limit.py")
    evaluation = load_module("evaluation_tests", "tests/test_evaluation.py")
    contracts = load_module("contract_tests", "tests/test_contracts_observability.py")
    cart_token = load_module("cart_token_tests", "tests/test_cart_token.py")
    aether_client = load_module("aether_client_tests", "tests/test_aether_client.py")
    graph_cart = load_module("graph_cart_tests", "tests/test_graph_cart.py")
    llm_provider = load_module("llm_provider_tests", "tests/test_llm_provider.py")
    tools = load_module("tool_tests", "tests/test_tools.py")
    migration = load_module("migration_tests", "tests/test_migrations.py")
    smoke = load_module("smoke_tests", "tests/test_smoke_script.py")
    security_scan = load_module("security_scan_tests", "tests/test_security_scan.py")
    api_contract_docs = load_module("api_contract_doc_tests", "tests/test_api_contract_docs.py")
    acceptance_docs = load_module("acceptance_doc_tests", "tests/test_acceptance_docs.py")
    api = load_module("api_smoke_tests", "tests/test_api_smoke.py")

    for test in [
        security.test_redact_pii_removes_card_email_and_phone,
        security.test_sanitize_external_text_strips_markup_controls_and_pii,
        security.test_sanitize_external_url_allows_only_http_urls,
        security.test_idempotency_key_is_stable,
        security.test_detect_search_intent,
        security.test_extracts_max_price,
        security.test_extracts_catalog_filters_sort_and_context_category,
        security.test_system_prompt_contains_core_injection_controls,
        security.test_unsafe_prompt_injection_requests_are_unsupported,
        evaluation.test_evaluation_dataset_has_required_size,
        evaluation.test_evaluation_runner_reports_metrics,
        evaluation.test_evaluation_pii_redaction_metric_checks_actual_input,
        evaluation.test_gemini_evaluation_limit_defaults_to_safe_size,
        evaluation.test_gemini_evaluation_limit_caps_large_requests,
        evaluation.test_gemini_evaluation_limit_rejects_zero,
        evaluation.test_gemini_evaluation_requires_api_key,
        evaluation.test_gemini_evaluation_accepts_structured_classifier_tuple,
        evaluation.test_gemini_evaluation_reports_safe_failure_reasons,
        evaluation.test_gemini_evaluation_configures_windows_event_loop_policy,
        evaluation.test_gemini_evaluation_times_out_slow_provider,
        contracts.test_product_contract_maps_cents_to_decimal_price,
        contracts.test_cart_contract_summarizes_items,
        contracts.test_metrics_render_prometheus_text,
        contracts.test_metrics_registry_exposes_required_zero_value_metrics,
        contracts.test_json_formatter_includes_graph_trace_fields_without_message_content,
        cart_token.test_verify_cart_token_accepts_matching_cart,
        cart_token.test_verify_cart_token_rejects_wrong_cart,
        cart_token.test_verify_cart_token_rejects_expired_token,
        llm_provider.test_build_gemini_model_configs_includes_distinct_fallback,
        llm_provider.test_build_gemini_model_configs_omits_duplicate_fallback,
        llm_provider.test_extract_token_usage_supports_langchain_and_provider_shapes,
        aether_client.test_aether_client_sends_cart_token_for_add_to_cart,
        aether_client.test_aether_client_sends_cart_token_for_update_item,
        aether_client.test_aether_client_resolves_authenticated_actor,
        aether_client.test_aether_client_retries_catalog_reads,
        aether_client.test_aether_client_sends_catalog_filter_params,
        aether_client.test_aether_client_caches_catalog_reads_with_short_ttl,
        aether_client.test_aether_client_does_not_cache_cart_reads,
        aether_client.test_aether_client_sanitizes_untrusted_product_fields,
        graph_cart.test_graph_updates_single_cart_item_from_current_cart,
        graph_cart.test_graph_persists_hashed_user_identity_when_authenticated,
        graph_cart.test_graph_respects_disabled_conversation_storage,
        graph_cart.test_graph_removes_single_cart_item_from_current_cart,
        graph_cart.test_graph_asks_clarification_for_ambiguous_product_variant,
        graph_cart.test_graph_adds_matching_variant_when_size_is_explicit,
        graph_cart.test_graph_checks_variant_availability_without_cart_audit,
        graph_cart.test_graph_compares_products_from_detail_records_without_cart_audit,
        graph_cart.test_graph_uses_current_product_category_for_similar_recommendations,
        graph_cart.test_graph_adds_second_recent_product_by_reference,
        graph_cart.test_graph_compacts_recent_product_references_across_turns,
        graph_cart.test_graph_does_not_resolve_recent_reference_without_previous_products,
        graph_cart.test_graph_audits_denied_cart_mutation_without_valid_token,
        graph_cart.test_graph_does_not_show_cart_without_valid_token,
        graph_cart.test_graph_does_not_open_checkout_without_valid_cart_token,
        graph_cart.test_graph_audits_clear_cart_without_confirmation,
        graph_cart.test_graph_clears_cart_only_after_explicit_confirmation,
        tools.test_resolve_product_variant_requires_unambiguous_size,
        tools.test_list_product_variants_filters_available_color_and_size,
        tools.test_comparison_row_uses_only_real_detail_fields,
        tools.test_resolve_cart_item_uses_single_item_only_when_not_named,
        migration.test_postgres_migration_file_contains_required_tables,
        migration.test_runtime_schema_keeps_required_indexes_in_sync_with_migration,
        smoke.test_smoke_script_uses_expected_endpoints,
        smoke.test_dockerfile_keeps_runtime_non_root_and_healthchecked,
        smoke.test_compose_exposes_local_dependencies_and_healthcheck,
        smoke.test_acceptance_audit_reports_artifacts_and_current_status,
        security_scan.test_stable_hash_does_not_match_secret_patterns,
        api_contract_docs.test_ai_assistant_openapi_documents_required_endpoints,
        api_contract_docs.test_ai_assistant_openapi_documents_structured_response_contract,
        api_contract_docs.test_ai_assistant_openapi_documents_sse_and_security_headers,
        acceptance_docs.test_required_ai_assistant_documentation_exists,
        acceptance_docs.test_architecture_document_contains_required_mermaid_diagrams,
        acceptance_docs.test_requirements_audit_tracks_verified_and_blocked_items,
        acceptance_docs.test_readme_documents_ai_assistant_operations,
        acceptance_docs.test_deploy_preflight_checks_required_github_config,
        acceptance_docs.test_ci_documents_minimum_assistant_pipeline_gates,
        acceptance_docs.test_ai_assistant_image_workflow_builds_smokes_and_publishes,
        acceptance_docs.test_production_workflow_smokes_ai_assistant_image_before_deploy,
        acceptance_docs.test_required_environment_variables_are_documented_and_configured,
        api.test_health_ready_and_metrics_endpoints,
        api.test_production_readiness_requires_server_side_dependencies,
        api.test_production_readiness_accepts_complete_config,
        api.test_general_message_does_not_require_external_catalog,
        api.test_stream_message_emits_required_safe_events,
        api.test_parse_cors_allowed_origins_trims_commas,
        api.test_startup_runs_migrations_when_enabled,
        api.test_message_input_size_uses_configured_limit,
        api.test_graph_execution_timeout_returns_safe_error,
        api.test_daily_budget_metrics_expose_thresholds,
        api.test_rate_limit_identities_use_validated_user_for_principal_scope,
        api.test_rate_limit_identities_fallback_to_anonymous_without_validated_user,
        api.test_rate_limit_identities_include_conversation_scope_when_thread_exists,
    ]:
        test()

    storage.test_create_storage_selects_configured_backend(pathlib.Path(tempfile.mkdtemp()))
    storage.test_sqlite_storage_persists_and_deletes_conversation(pathlib.Path(tempfile.mkdtemp()))
    storage.test_sqlite_storage_tracks_daily_usage(pathlib.Path(tempfile.mkdtemp()))
    storage.test_sqlite_storage_lists_audit_events_by_thread(pathlib.Path(tempfile.mkdtemp()))
    storage.test_sqlite_storage_reads_conversation_metadata(pathlib.Path(tempfile.mkdtemp()))
    storage.test_sqlite_storage_deletes_conversations_by_user_hash(pathlib.Path(tempfile.mkdtemp()))
    storage.test_sqlite_storage_purges_expired_conversations(pathlib.Path(tempfile.mkdtemp()))
    storage.test_sqlite_storage_purge_keeps_unexpired_conversations(pathlib.Path(tempfile.mkdtemp()))
    storage.test_rate_limiter_blocks_after_minute_limit()
    storage.test_rate_limiter_blocks_after_anonymous_day_limit()
    storage.test_in_memory_concurrency_limiter_blocks_when_full()
    tools.test_tool_adds_recent_product_with_stable_idempotency_key()
    tools.test_tool_get_product_variants_returns_filtered_structured_variants()
    tools.test_tool_compare_products_fetches_details_for_both_products()
    tools.test_tool_clear_cart_requires_confirmation_token()
    llm_provider.test_graph_uses_fallback_model_before_heuristic_classifier()
    llm_provider.test_graph_records_llm_token_metrics_when_provider_reports_usage()
    security_scan.test_security_scan_detects_secret_like_values(pathlib.Path(tempfile.mkdtemp()))
    security_scan.test_security_scan_allows_empty_placeholders(pathlib.Path(tempfile.mkdtemp()))
    api.test_daily_budget_blocks_after_configured_limit()
    api.test_message_endpoint_blocks_when_concurrency_limit_is_full()
    api.test_internal_audit_endpoint_requires_operations_token()
    api.test_internal_audit_endpoint_lists_authorized_events()
    api.test_internal_delete_user_conversations_requires_operations_token()
    api.test_internal_delete_user_conversations_removes_messages()
    api.test_internal_purge_expired_conversations_requires_operations_token()
    api.test_internal_purge_expired_conversations_removes_expired_messages()
    api.test_conversation_read_requires_owner_session()
    api.test_conversation_delete_requires_owner_session()
    print("ai_assistant_direct_tests_ok")


if __name__ == "__main__":
    main()
