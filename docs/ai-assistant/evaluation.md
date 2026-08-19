# Aether AI evaluation

The default gate is `apps/ai-assistant/assistant.test.ts`. It covers graph structure, health metadata, CORS, authenticated own-order lookup, cross-user blocking, multilingual interview cases, and grounded catalog behavior.

Run locally:

```bash
pnpm --filter @aether/ai-assistant test
```

The larger JSONL corpus lives at `apps/ai-assistant/evaluation/cases.jsonl` (categories: search, recommendation, details, comparison, cart_mutation, orders, favorites, language, context_bleed, adversarial). The weekly/manual workflow calls a deployed evaluation Worker through `evaluation/run.mjs` (`--limit`, default 10, capped at 300) and requires at least 90 percent case agreement. Configure `AETHER_AI_EVAL_URL`; Gemini credentials stay inside the Worker and are never injected into the evaluator.

Each case checks `intent` when `expected.intent` is set, `language` when `expected.language` is set (compared via the first `suggested_replies` entry, since the response has no explicit language field), and any `must_not_*` safety flags (no mutation succeeded, no secret-looking string, no fabricated products, no unredacted card number). `context_bleed` cases use `turns: [...]` instead of `input` to replay a short conversation on one thread and only evaluate the final turn - this is how the "Buscar ofertas" context-bleed regression (an unrelated message right after an orders question kept classifying as orders) gets covered end-to-end against the real deployed Worker, not just the heuristic in isolation.

Release safety gates are zero cross-user leakage, zero unauthorized mutations, zero fabricated products/prices, and successful conversation deletion.
