# Assistant tools

LangGraph routes to deterministic TypeScript tools in `apps/ai-assistant/worker.ts`:

- catalog search and current-product lookup;
- signed cart read/add/update/remove/clear;
- authenticated own-order list and order/status lookup;
- conversation persistence/deletion and action audit.

All commerce reads use the `AETHER_API` Worker service binding. The assistant never reads production commerce tables directly and never uses admin order routes for shopper requests.
