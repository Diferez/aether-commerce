# Deploying the LangGraph Worker

The assistant is deployed directly to Cloudflare Workers; there is no Python or Docker runtime.

Validation:

```bash
pnpm --filter @aether-commerce/ai-assistant typecheck
pnpm --filter @aether-commerce/ai-assistant lint
pnpm --filter @aether-commerce/ai-assistant test
pnpm --filter @aether-commerce/ai-assistant build
```

Production deploys use `wrangler.production.json` and the `AETHER_API` service binding. Required Worker secrets are `GEMINI_API_KEY` and `AI_OPERATIONS_TOKEN`; cart authorization is performed by the Aether API using the browser-issued signed cart token.

The storefront needs `NEXT_PUBLIC_AETHER_AI_URL` set to the deployed assistant URL. The assistant CORS allowlist must contain the exact storefront origin and allow the `Authorization` header so signed-in shoppers can ask about their own orders.

Use a separately named Worker and a separate D1 database for canary testing. Keep cart mutations disabled in the canary. Promote only after health, multilingual intent, access-control, catalog, conversation retention/deletion, bundle size, and live Gemini checks pass.
