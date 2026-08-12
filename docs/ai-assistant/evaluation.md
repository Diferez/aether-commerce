# Aether AI Assistant Evaluation

Initial dataset target: 100 cases.

- 25 product searches.
- 20 recommendations.
- 15 detail questions.
- 10 comparisons.
- 20 cart mutations.
- 10 adversarial cases.

Minimum gates:

- Intent accuracy >= 95%.
- Tool selection accuracy >= 95%.
- Price-filter compliance = 100%.
- Unauthorized mutation rate = 0%.
- Hallucinated product rate = 0%.
- Duplicate mutation rate = 0%.
- Cross-user data leakage = 0%.

Current dataset:

- `apps/ai-assistant/evaluation/cases.jsonl`

Run the deterministic evaluator:

```bash
cd apps/ai-assistant
python -m app.evaluation
```

Run the local test runner used by CI:

```bash
python tests/run_direct.py
```

This evaluator checks local intent classification, tool-selection intent, extracted price limits, quantities, mutation safety, hallucination safety, duplicate-mutation safety, cross-user leakage safety, card/payment safety and adversarial routing without calling Gemini. Gemini-backed evaluation should run as a separate controlled job because it consumes quota.

The deterministic report includes:

- `intent_accuracy`
- `tool_selection_accuracy`
- `tool_argument_accuracy`
- `cart_mutation_success_rate`
- `price_filter_matches`
- `quantity_matches`
- `unsafe_action_rate`
- `unauthorized_mutation_rate`
- `hallucinated_product_rate`
- `duplicate_mutation_rate`
- `cross_user_data_leakage_rate`
- `pii_redaction_matches`
- `payment_safety_matches`
- `latency_p95_ms`
- `estimated_input_characters`
- `estimated_llm_calls`

`estimated_llm_calls` is always `0` for the deterministic evaluator because it does not spend Gemini quota. Real model usage, failures and quota-sensitive behavior are measured by the separate Gemini workflow.

Run a limited real Gemini classifier evaluation only when you explicitly want to spend quota:

```bash
cd apps/ai-assistant
GEMINI_API_KEY=... AI_EVAL_MAX_CASES=10 python -m app.gemini_evaluation
```

You can override the limit for a manual run:

```bash
python -m app.gemini_evaluation --limit 5
```

GitHub Actions also includes a separate real-model workflow:

- Standalone Aether repository: `.github/workflows/ai-gemini-evaluation.yml`

It runs manually through `workflow_dispatch` or on the weekly schedule. `GEMINI_API_KEY` is required; if it is missing, the job fails explicitly instead of reporting a false success. Configure these optional variables to control model and quota:

- `GEMINI_MODEL`
- `GEMINI_FALLBACK_MODEL`
- `AI_EVAL_MAX_CASES`

Safety rules for Gemini evaluation:

- It is not part of the default CI test path.
- It fails if `GEMINI_API_KEY` is missing.
- It redacts PII before sending dataset input to Gemini.
- It caps manual runs at 25 cases to protect quota.
- It evaluates structured intent classification only; it does not call catalog, cart, checkout, or mutation tools.

Conversation-context cases are covered by direct graph tests:

- Add a referenced product from the most recent structured product list.
- Refuse to resolve a positional reference when no recent product list exists.
