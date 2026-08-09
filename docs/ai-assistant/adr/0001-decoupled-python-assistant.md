# ADR 0001: Decoupled Python Assistant

## Status

Accepted

## Context

Aether currently uses static Next.js frontends and a Cloudflare Worker API. The assistant requirement asks for FastAPI, LangGraph and Gemini.

## Decision

Implement the assistant as `apps/ai-assistant`, a separate Python service. It communicates with the Worker API instead of reading D1 directly.

## Consequences

- Keeps Cloudflare Worker commerce logic as source of truth.
- Avoids exposing Gemini secrets to the frontend.
- Requires separate deployment for the Python runtime.
- Enables Redis/PostgreSQL without changing the Worker runtime.
