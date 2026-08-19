# Agent extension

`agent-core` owns reusable prompt composition and guardrails. Client adapters pass store context, tools and business instructions while keeping provider credentials, rate limits and bindings in their runtime.

The Aether storefront assistant (`apps/ai-assistant`) is a TypeScript
LangGraph.js Cloudflare Worker built on `agent-core`'s TypeScript surface
(conversation-memory ownership, tool telemetry, Gemini provider adapter).
The earlier Python/LangGraph container adapter
(`packages/agent-core/python`, `apps/ai-assistant`'s FastAPI/Docker
runtime) has been removed.

The admin panel's own "Aether Chat" agent
(`apps/api/src/services/admin-chat/`) is a separate, independent
implementation - it does not import `agent-core` - built directly inside
`apps/api` against its own D1-backed conversation/pending-action tables
(migration `0019_admin_chat.sql`). `agent-core` is not yet the shared
foundation for both assistants; extracting a common layer between them is
open follow-up work, not something already done.
