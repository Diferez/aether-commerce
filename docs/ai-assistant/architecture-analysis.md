# Architecture analysis

The Aether platform already runs its storefront and API on Cloudflare. Two deployment spikes compared Python LangGraph and LangGraph.js on the free Worker runtime. Python failed on current native/WASM dependencies or exceeded the compressed size limit; LangGraph.js bundled successfully and executed a real conditional graph.

Production therefore uses one TypeScript assistant Worker. Commercial truth remains in the Hono API and D1 commerce database. The assistant has its own D1 persistence binding, calls Gemini by REST, and never embeds secrets in the storefront.

This choice removes the separate FastAPI container, Redis/PostgreSQL requirements and GHCR image workflow while preserving an explicit, testable graph.
