# Agent extension

`agent-core` owns reusable prompt composition and guardrails. Client adapters pass store context, tools and business instructions while keeping provider credentials, rate limits and bindings in their runtime.

For Python/LangGraph adapters, the same package contains a small installable
runtime at `packages/agent-core/python`. Its `compile_agent_graph` primitive
owns only graph assembly and deterministic fallback wiring; client adapters own
their state, nodes, prompts, tools, provider, persistence and deployment
bindings. The Aether Python assistant consumes this primitive through
`PYTHONPATH`; the container builds from the repository root so that source is
included without copying it into the app.
