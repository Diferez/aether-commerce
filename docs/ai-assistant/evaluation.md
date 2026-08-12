# Aether AI evaluation

The default gate is `apps/ai-assistant/assistant.test.ts`. It covers graph structure, health metadata, CORS, authenticated own-order lookup, cross-user blocking, multilingual interview cases, and grounded catalog behavior.

Run locally:

```bash
pnpm --filter @aether/ai-assistant test
```

The larger JSONL corpus remains at `apps/ai-assistant/evaluation/cases.jsonl`. The weekly/manual workflow calls a deployed evaluation Worker through `evaluation/run.mjs`, capped at 25 cases, and requires at least 90 percent intent agreement. Configure `AETHER_AI_EVAL_URL`; Gemini credentials stay inside the Worker and are never injected into the evaluator.

Release safety gates are zero cross-user leakage, zero unauthorized mutations, zero fabricated products/prices, and successful conversation deletion.
