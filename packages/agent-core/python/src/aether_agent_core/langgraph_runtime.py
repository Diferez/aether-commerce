"""Small, provider-neutral LangGraph assembly primitive.

Store implementations own their state, nodes, tools, prompts and persistence.
This module owns only graph wiring and a supplied deterministic fallback so a
runtime can retain safe behavior when LangGraph is not installed in a local
test environment.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

try:
    from langgraph.graph import END, START, StateGraph
except ModuleNotFoundError:  # pragma: no cover - exercised through fallback contract
    END = "__end__"
    START = "__start__"
    StateGraph = None


AgentState = dict[str, Any]
AgentNode = Callable[[AgentState], Any]
Route = Callable[[AgentState], str]


@dataclass(frozen=True)
class ConditionalEdge:
    """A client-defined route with an explicit, allow-listed destination map."""

    source: str
    route: Route
    destinations: Mapping[str, str]


def compile_agent_graph(
    *,
    state_schema: type[Any],
    nodes: Mapping[str, AgentNode],
    start_node: str,
    edges: tuple[tuple[str, str], ...],
    conditional_edges: tuple[ConditionalEdge, ...] = (),
    terminal_node: str,
    fallback: Callable[[], Any],
) -> Any:
    """Compile a reusable graph without importing client infrastructure.

    The caller supplies every business node and the fallback implementation.
    That makes the same graph topology usable with another store's catalog,
    permissions, storage and provider adapters while preserving its behavior.
    """

    if StateGraph is None:
        return fallback()

    graph = StateGraph(state_schema)
    for name, node in nodes.items():
        graph.add_node(name, node)
    graph.add_edge(START, start_node)
    for source, target in edges:
        graph.add_edge(source, target)
    for edge in conditional_edges:
        graph.add_conditional_edges(edge.source, edge.route, dict(edge.destinations))
    graph.add_edge(terminal_node, END)
    return graph
