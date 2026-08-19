# ADR 0001: LangGraph.js on Cloudflare Workers

Status: superseded and updated 2026-08-12.

The original design selected a separate Python/FastAPI service because LangGraph was not expected to fit Cloudflare Workers. Deployment experiments later proved that current Python LangGraph dependencies do not fit the free Worker path, while LangGraph.js 1.4.8 bundles well below the limit and starts quickly.

The accepted architecture is therefore a standalone TypeScript Worker using LangGraph.js, a service binding to the Aether API, and D1 for conversations, rate limits, usage and audit. The former Python/Docker implementation was removed to eliminate duplicated behavior and CI cost.
