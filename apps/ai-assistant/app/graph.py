import logging
from typing import Any, TypedDict
from uuid import uuid4

from aether_agent_core import ConditionalEdge, compile_agent_graph
from app.observability import metrics

from app.clients.aether import AetherApiClient
from app.cart_token import verify_cart_token
from app.config import Settings
from app.intent import detect_intent_heuristic, extract_constraints_heuristic
from app.llm.intent_classifier import classify_intent_with_llm
from app.llm.provider import StructuredChatModel
from app.schemas import (
    AssistantAction,
    AssistantMessageRequest,
    AssistantResponse,
)
from app.security import idempotency_key, redact_pii, request_id, stable_hash
from app.storage import AssistantStorage
from app.tools import AetherAssistantTools, CLEAR_CART_CONFIRMATION_TOKEN, ToolExecution

logger = logging.getLogger("aether.ai_assistant.graph")


class AssistantState(TypedDict, total=False):
    request_id: str
    thread_id: str
    session_id: str
    user_id: str | None
    locale: str
    currency: str
    message: str
    client_context: dict[str, Any]
    intent: str
    confidence: float
    extracted_constraints: dict[str, Any]
    referenced_product_ids: list[str]
    recent_products: list[dict[str, Any]]
    candidate_products: list[dict[str, Any]]
    cart_id: str | None
    cart_token: str | None
    cart_authorized: bool
    cart_snapshot: dict[str, Any] | None
    pending_action: dict[str, Any] | None
    action_result: dict[str, Any] | None
    audit_event: dict[str, Any] | None
    clarification_required: bool
    clarification_question: str | None
    tool_call_count: int
    llm_call_count: int
    error_code: str | None
    error_message: str | None
    response: AssistantResponse


class LocalAssistantWorkflow:
    nodes = {
        "__start__",
        "validate_request",
        "load_conversation_context",
        "detect_intent",
        "extract_constraints",
        "route_intent",
        "product_search",
        "product_details",
        "product_comparison",
        "cart_read",
        "cart_mutation_precheck",
        "clarification",
        "general_store_help",
        "unsupported_request",
        "execute_authorized_tool",
        "validate_tool_result",
        "compose_response",
        "persist_audit_event",
    }

    def __init__(self, assistant: "AssistantGraph") -> None:
        self.assistant = assistant

    def compile(self) -> "LocalAssistantWorkflow":
        """Match LangGraph's compile contract for environments without it."""
        return self

    async def ainvoke(self, state: AssistantState, config: dict[str, Any] | None = None) -> AssistantState:
        state = await self.assistant._validate_request(state)
        state = await self.assistant._load_context(state)
        state = await self.assistant._detect_intent(state)
        state = await self.assistant._extract_constraints(state)
        state = await self.assistant._route_intent(state)

        route = state.get("pending_action", {}).get("node", "unsupported_request")
        routed_nodes = {
            "product_search": self.assistant._product_search,
            "product_details": self.assistant._product_details,
            "product_comparison": self.assistant._product_comparison,
            "cart_read": self.assistant._cart_read,
            "cart_mutation_precheck": self.assistant._cart_mutation_precheck,
            "clarification": self.assistant._clarification,
            "general_store_help": self.assistant._general_store_help,
            "unsupported_request": self.assistant._unsupported,
        }
        state = await routed_nodes.get(str(route), self.assistant._unsupported)(state)
        if route in {"product_search", "product_details", "product_comparison", "cart_read", "cart_mutation_precheck"}:
            state = await self.assistant._execute_authorized_tool(state)
            state = await self.assistant._validate_tool_result(state)
        state = await self.assistant._compose_response(state)
        state = await self.assistant._persist_audit_event(state)
        return state


class AssistantGraph:
    def __init__(
        self,
        settings: Settings,
        aether: AetherApiClient,
        storage: AssistantStorage,
        chat_model: StructuredChatModel | list[StructuredChatModel] | None = None,
    ) -> None:
        self.settings = settings
        self.aether = aether
        self.tools = AetherAssistantTools(aether)
        self.storage = storage
        if isinstance(chat_model, list):
            self.chat_models = chat_model
        else:
            self.chat_models = [chat_model] if chat_model is not None else []
        self.last_llm_call_count = 0
        self.last_tool_call_count = 0
        self.graph = self._build_graph().compile()

    async def run(
        self,
        request: AssistantMessageRequest,
        cart_id: str | None,
        session_id: str,
        cart_token: str | None = None,
        user_id: str | None = None,
    ) -> AssistantResponse:
        rid = request_id()
        redacted_message = redact_pii(request.message) if self.settings.ai_redact_pii else request.message
        state: AssistantState = {
            "request_id": rid,
            "thread_id": str(request.thread_id or uuid4()),
            "session_id": session_id,
            "user_id": user_id,
            "locale": request.locale,
            "currency": request.currency,
            "message": redacted_message,
            "client_context": request.client_context.model_dump(),
            "cart_id": cart_id,
            "cart_token": cart_token,
            "cart_authorized": verify_cart_token(cart_token, self.settings.aether_cart_token_secret, cart_id),
            "tool_call_count": 0,
            "llm_call_count": 0,
        }
        self._log_node(state, "graph_start", status="started")

        if self.settings.ai_store_conversations:
            await self.storage.ensure_conversation(
                state["thread_id"],
                session_hash=stable_hash(session_id) or "anonymous",
                user_id=stable_hash(user_id) if user_id else None,
                locale=request.locale,
                retention_days=self.settings.ai_conversation_retention_days,
            )
            await self.storage.save_message(
                state["thread_id"],
                "user",
                redacted_message if self.settings.ai_log_message_content else None,
                {"locale": request.locale, "client_context": request.client_context.model_dump()},
            )

        result = await self.graph.ainvoke(state, {"recursion_limit": self.settings.ai_max_graph_steps})
        self.last_llm_call_count = int(result.get("llm_call_count", 0))
        self.last_tool_call_count = int(result.get("tool_call_count", 0))
        response = result["response"]
        assistant_payload = response.model_dump(mode="json")
        active_products = result.get("candidate_products") or result.get("recent_products") or []
        if active_products:
            assistant_payload["context_summary"] = {"recent_products": active_products[: self.settings.ai_max_products_per_response]}
        if self.settings.ai_store_conversations:
            await self.storage.save_message(
                response.thread_id,
                "assistant",
                response.message if self.settings.ai_log_message_content else None,
                assistant_payload,
            )
        return response

    @staticmethod
    def _log_node(
        state: AssistantState,
        node: str,
        *,
        status: str = "ok",
        tool_name: str | None = None,
        error_code: str | None = None,
    ) -> None:
        logger.info(
            "assistant_graph_node",
            extra={
                "request_id": state.get("request_id"),
                "thread_id": state.get("thread_id"),
                "session_hash": stable_hash(state.get("session_id")),
                "intent": state.get("intent"),
                "confidence": state.get("confidence"),
                "node": node,
                "tool_name": tool_name,
                "status": status,
                "error_code": error_code or state.get("error_code"),
                "llm_call_count": int(state.get("llm_call_count", 0)),
                "tool_call_count": int(state.get("tool_call_count", 0)),
            },
        )

    def _build_graph(self):
        routes = {
            "product_search": "product_search",
            "product_details": "product_details",
            "product_comparison": "product_comparison",
            "cart_read": "cart_read",
            "cart_mutation_precheck": "cart_mutation_precheck",
            "clarification": "clarification",
            "general_store_help": "general_store_help",
            "unsupported_request": "unsupported_request",
        }
        return compile_agent_graph(
            state_schema=AssistantState,
            nodes={
                "validate_request": self._validate_request,
                "load_conversation_context": self._load_context,
                "detect_intent": self._detect_intent,
                "extract_constraints": self._extract_constraints,
                "route_intent": self._route_intent,
                "product_search": self._product_search,
                "product_details": self._product_details,
                "product_comparison": self._product_comparison,
                "cart_read": self._cart_read,
                "cart_mutation_precheck": self._cart_mutation_precheck,
                "clarification": self._clarification,
                "general_store_help": self._general_store_help,
                "unsupported_request": self._unsupported,
                "execute_authorized_tool": self._execute_authorized_tool,
                "validate_tool_result": self._validate_tool_result,
                "compose_response": self._compose_response,
                "persist_audit_event": self._persist_audit_event,
            },
            start_node="validate_request",
            edges=(
                ("validate_request", "load_conversation_context"),
                ("load_conversation_context", "detect_intent"),
                ("detect_intent", "extract_constraints"),
                ("extract_constraints", "route_intent"),
                *( (node, "execute_authorized_tool") for node in ("product_search", "product_details", "product_comparison", "cart_read", "cart_mutation_precheck") ),
                *( (node, "compose_response") for node in ("clarification", "general_store_help", "unsupported_request") ),
                ("execute_authorized_tool", "validate_tool_result"),
                ("validate_tool_result", "compose_response"),
                ("compose_response", "persist_audit_event"),
            ),
            conditional_edges=(
                ConditionalEdge(
                    source="route_intent",
                    route=lambda state: state.get("pending_action", {}).get("node", "unsupported_request"),
                    destinations=routes,
                ),
            ),
            terminal_node="persist_audit_event",
            fallback=lambda: LocalAssistantWorkflow(self),
        )

    async def _validate_request(self, state: AssistantState) -> AssistantState:
        if not self.settings.ai_assistant_enabled:
            state["error_code"] = "ASSISTANT_DISABLED"
        self._log_node(state, "validate_request", status="blocked" if state.get("error_code") else "ok")
        return state

    async def _load_context(self, state: AssistantState) -> AssistantState:
        if not self.settings.ai_store_conversations:
            state["recent_products"] = []
            state["action_result"] = {"previous_message_count": 0, "conversation_storage": "disabled"}
            self._log_node(state, "load_conversation_context")
            return state

        context_limit = max(1, self.settings.ai_max_conversation_messages) + 4
        previous = await self.storage.list_messages(state["thread_id"], context_limit)
        state["recent_products"] = self._last_product_list(previous)
        state["action_result"] = {"previous_message_count": len(previous)}
        self._log_node(state, "load_conversation_context")
        return state

    async def _detect_intent(self, state: AssistantState) -> AssistantState:
        result = None
        for model_index, chat_model in enumerate(self.chat_models):
            if int(state.get("llm_call_count", 0)) >= self.settings.ai_max_llm_calls_per_request:
                break
            try:
                state["llm_call_count"] = int(state.get("llm_call_count", 0)) + 1
                with metrics.timer("ai_llm_duration_seconds"):
                    result, token_usage = await classify_intent_with_llm(chat_model, state["message"])
                metrics.inc("ai_llm_tokens_input_total", token_usage.input_tokens)
                metrics.inc("ai_llm_tokens_output_total", token_usage.output_tokens)
                break
            except Exception:
                metrics.inc("ai_fallback_total")
                result = None
                if model_index == len(self.chat_models) - 1:
                    break

        if result is None:
            result = detect_intent_heuristic(state["message"])
        state["intent"] = result.intent
        state["confidence"] = result.confidence
        self._log_node(state, "detect_intent")
        return state

    async def _extract_constraints(self, state: AssistantState) -> AssistantState:
        state["extracted_constraints"] = extract_constraints_heuristic(
            state["message"], self.settings.ai_max_products_per_response, state.get("client_context")
        )
        self._log_node(state, "extract_constraints")
        return state

    async def _route_intent(self, state: AssistantState) -> AssistantState:
        if state.get("error_code"):
            state["pending_action"] = {"node": "unsupported_request"}
            return state

        intent = state.get("intent")
        confidence = float(state.get("confidence", 0))
        if confidence < self.settings.ai_intent_confidence_threshold:
            state["pending_action"] = {"node": "clarification"}
        elif intent in ["SEARCH_PRODUCTS", "RECOMMEND_PRODUCTS"]:
            state["pending_action"] = {"node": "product_search"}
        elif intent in ["GET_PRODUCT_DETAILS", "CHECK_VARIANT_AVAILABILITY"]:
            state["pending_action"] = {"node": "product_details"}
        elif intent == "COMPARE_PRODUCTS":
            state["pending_action"] = {"node": "product_comparison"}
        elif intent == "GET_CART":
            state["pending_action"] = {"node": "cart_read"}
        elif intent in ["ADD_TO_CART", "REMOVE_FROM_CART", "CLEAR_CART", "UPDATE_CART_ITEM"]:
            state["pending_action"] = {"node": "cart_mutation_precheck"}
        elif intent == "CHECKOUT_REQUEST":
            state["pending_action"] = {"node": "cart_read"}
        elif intent == "GENERAL_STORE_QUESTION":
            state["pending_action"] = {"node": "general_store_help"}
        else:
            state["pending_action"] = {"node": "unsupported_request"}
        self._log_node(state, "route_intent")
        return state

    async def _product_search(self, state: AssistantState) -> AssistantState:
        constraints = dict(state["extracted_constraints"])
        if self._is_similar_request(state) and not constraints.get("category"):
            category = await self._category_from_current_product(state)
            if category:
                constraints["category"] = category
        state["pending_action"] = {"tool": "search_products", "args": constraints}
        return state

    @staticmethod
    def _is_similar_request(state: AssistantState) -> bool:
        message = str(state.get("message") or "").lower()
        return any(word in message for word in ["similar", "similares", "alternativa", "alternativas"])

    async def _category_from_current_product(self, state: AssistantState) -> str | None:
        context = state.get("client_context") or {}
        slug = context.get("current_product_slug") or context.get("current_product_id")
        if not slug:
            return None
        try:
            detail = await self.aether.get_product_details(str(slug))
        except Exception:
            metrics.inc("ai_tool_errors_total")
            return None
        category = detail.get("category") if isinstance(detail, dict) else None
        if isinstance(category, dict):
            value = category.get("slug") or category.get("id")
            return str(value) if value else None
        return str(category) if category else None

    async def _product_details(self, state: AssistantState) -> AssistantState:
        if state.get("intent") == "CHECK_VARIANT_AVAILABILITY":
            state["pending_action"] = {"tool": "get_product_variants", "args": state["extracted_constraints"]}
            return state
        state["pending_action"] = {"tool": "get_product_details", "args": state["extracted_constraints"]}
        return state

    async def _product_comparison(self, state: AssistantState) -> AssistantState:
        args = dict(state["extracted_constraints"])
        if state.get("recent_products"):
            args["recent_products"] = state["recent_products"]
        state["pending_action"] = {"tool": "compare_products", "args": args}
        return state

    async def _cart_read(self, state: AssistantState) -> AssistantState:
        state["pending_action"] = {"tool": "get_cart", "args": {}}
        return state

    async def _cart_mutation_precheck(self, state: AssistantState) -> AssistantState:
        if not self.settings.ai_mutations_enabled:
            state["error_code"] = "MUTATIONS_DISABLED"
            self._set_denied_audit_event(state, "mutation_requested", "MUTATIONS_DISABLED")
            return state
        if not state.get("cart_id") or not state.get("cart_authorized"):
            state["clarification_required"] = True
            state["clarification_question"] = "Necesito validar tu carrito antes de actualizarlo. Vuelve a abrir la tienda e intenta de nuevo."
            self._set_denied_audit_event(state, "mutation_requested", "CART_NOT_AUTHORIZED")
            return state
        if float(state.get("confidence", 0)) < self.settings.ai_mutation_confidence_threshold:
            state["clarification_required"] = True
            state["clarification_question"] = "Me confirmas exactamente que producto quieres modificar en el carrito?"
            self._set_denied_audit_event(state, "mutation_requested", "LOW_MUTATION_CONFIDENCE")
            return state
        if state.get("intent") == "CLEAR_CART" and "confirmar vaciar carrito" not in state["message"].lower():
            state["clarification_required"] = True
            state["clarification_question"] = "Para vaciar todo el carrito necesito una confirmacion explicita: escribe confirmar vaciar carrito."
            self._set_denied_audit_event(state, "clear_cart", "CONFIRMATION_REQUIRED")
            return state
        if state.get("intent") == "CLEAR_CART":
            state["pending_action"] = {"tool": "clear_cart", "args": {"confirmation_token": CLEAR_CART_CONFIRMATION_TOKEN}}
            return state
        if state.get("intent") in ["REMOVE_FROM_CART", "UPDATE_CART_ITEM"]:
            state["pending_action"] = {"tool": "resolve_cart_item", "args": state["extracted_constraints"], "then": state["intent"]}
            return state
        constraints = state["extracted_constraints"]
        if state.get("intent") == "ADD_TO_CART" and constraints.get("referenced_position"):
            state["pending_action"] = {
                "tool": "resolve_recent_product",
                "args": constraints,
                "then": state["intent"],
            }
            return state
        state["pending_action"] = {"tool": "search_products", "args": constraints, "then": state["intent"]}
        return state

    @staticmethod
    def _set_denied_audit_event(state: AssistantState, tool_name: str, error_code: str) -> None:
        intent = str(state.get("intent") or "UNSUPPORTED")
        normalized_arguments = f"intent:{intent};cart:{state.get('cart_id') or 'none'}"
        state["audit_event"] = {
            "tool_name": tool_name,
            "normalized_arguments": normalized_arguments,
            "target_entity_id": state.get("cart_id"),
            "idempotency_key": idempotency_key(state["request_id"], tool_name, normalized_arguments),
            "authorization_result": "denied",
            "execution_status": "blocked",
            "error_code": error_code,
        }
        metrics.inc("ai_cart_mutation_failures_total")

    async def _clarification(self, state: AssistantState) -> AssistantState:
        state["clarification_required"] = True
        state["clarification_question"] = "Que tipo de producto buscas y cual es tu presupuesto maximo?"
        return state

    async def _general_store_help(self, state: AssistantState) -> AssistantState:
        state["action_result"] = {"message": "Puedo ayudarte a buscar productos reales, comparar opciones y preparar tu carrito."}
        return state

    async def _unsupported(self, state: AssistantState) -> AssistantState:
        state["action_result"] = {"message": "No puedo completar esa solicitud desde el asistente, pero puedes seguir navegando la tienda."}
        return state

    async def _execute_authorized_tool(self, state: AssistantState) -> AssistantState:
        action = state.get("pending_action") or {}
        tool = action.get("tool")
        state["tool_call_count"] = int(state.get("tool_call_count", 0)) + 1
        if state["tool_call_count"] > self.settings.ai_max_tool_calls_per_request:
            state["error_code"] = "TOOL_LIMIT_EXCEEDED"
            self._log_node(state, "execute_authorized_tool", status="blocked", tool_name=str(tool or ""))
            return state

        try:
            execution: ToolExecution | None = None
            if tool == "search_products":
                with metrics.timer("ai_tool_duration_seconds"):
                    execution = await self.tools.search_products(action.get("args", {}))
                products = execution.products or []
                state["candidate_products"] = [product.model_dump(mode="json") for product in products]
                if action.get("then") == "ADD_TO_CART" and len(products) == 1 and state.get("cart_id"):
                    quantity = int((state.get("extracted_constraints") or {}).get("quantity") or 1)
                    with metrics.timer("ai_tool_duration_seconds"):
                        execution = await self.tools.add_single_search_result_to_cart(
                            request_id=state["request_id"],
                            cart_id=state["cart_id"],
                            cart_token=state["cart_token"] or "",
                            product=products[0],
                            quantity=quantity,
                            constraints=state.get("extracted_constraints") or {},
                        )
                    self._apply_tool_execution(state, execution, count_cart_mutation=True)
                elif action.get("then") == "ADD_TO_CART":
                    state["clarification_required"] = True
                    state["clarification_question"] = "Encontre varias opciones. Cual quieres agregar al carrito?"
            elif tool == "get_product_details":
                with metrics.timer("ai_tool_duration_seconds"):
                    execution = await self.tools.get_product_details(action.get("args", {}))
                products = execution.products or []
                state["candidate_products"] = [product.model_dump(mode="json") for product in products]
                if execution.needs_clarification:
                    state["clarification_required"] = True
                    state["clarification_question"] = execution.clarification_question
            elif tool == "get_product_variants":
                with metrics.timer("ai_tool_duration_seconds"):
                    execution = await self.tools.get_product_variants(action.get("args", {}))
                products = execution.products or []
                state["candidate_products"] = [product.model_dump(mode="json") for product in products]
                variants = [variant.model_dump(mode="json") for variant in execution.variants or []]
                state["action_result"] = {
                    "tool_name": "get_product_variants",
                    "variants": variants,
                    "variant_count": len(variants),
                }
                if execution.needs_clarification:
                    state["clarification_required"] = True
                    state["clarification_question"] = execution.clarification_question
            elif tool == "compare_products":
                with metrics.timer("ai_tool_duration_seconds"):
                    execution = await self.tools.compare_products(action.get("args", {}))
                products = execution.products or []
                state["candidate_products"] = [product.model_dump(mode="json") for product in products]
                state["action_result"] = {
                    "tool_name": "compare_products",
                    "comparison": execution.comparison or [],
                    "comparison_count": len(execution.comparison or []),
                }
                if execution.needs_clarification:
                    state["clarification_required"] = True
                    state["clarification_question"] = execution.clarification_question
            elif tool == "resolve_recent_product" and action.get("then") == "ADD_TO_CART" and state.get("cart_id"):
                quantity = int((state.get("extracted_constraints") or {}).get("quantity") or 1)
                with metrics.timer("ai_tool_duration_seconds"):
                    execution = await self.tools.add_recent_product_to_cart(
                        request_id=state["request_id"],
                        cart_id=state["cart_id"],
                        cart_token=state["cart_token"] or "",
                        recent_products=state.get("recent_products") or [],
                        referenced_position=int((action.get("args") or {}).get("referenced_position") or 0),
                        quantity=quantity,
                        constraints=state.get("extracted_constraints") or {},
                    )
                self._apply_tool_execution(state, execution, count_cart_mutation=True)
            elif tool == "clear_cart" and state.get("cart_id"):
                with metrics.timer("ai_tool_duration_seconds"):
                    execution = await self.tools.clear_cart(
                        request_id=state["request_id"],
                        cart_id=state["cart_id"],
                        cart_token=state["cart_token"] or "",
                        confirmation_token=str((action.get("args") or {}).get("confirmation_token") or ""),
                    )
                self._apply_tool_execution(state, execution, count_cart_mutation=True)
            elif tool == "resolve_cart_item" and state.get("cart_id"):
                quantity = int((state.get("extracted_constraints") or {}).get("quantity") or 1)
                with metrics.timer("ai_tool_duration_seconds"):
                    execution = await self.tools.update_or_remove_cart_item(
                        request_id=state["request_id"],
                        cart_id=state["cart_id"],
                        cart_token=state["cart_token"] or "",
                        message=state["message"],
                        action=str(action.get("then")),
                        quantity=quantity,
                    )
                self._apply_tool_execution(state, execution, count_cart_mutation=not execution.needs_clarification)
            elif tool == "get_cart" and state.get("cart_id") and state.get("cart_authorized"):
                with metrics.timer("ai_tool_duration_seconds"):
                    execution = await self.tools.get_cart(state["cart_id"], state["cart_token"] or "")
                if execution.cart:
                    state["cart_snapshot"] = execution.cart.model_dump(mode="json")
            elif tool == "get_cart":
                state["clarification_required"] = True
                state["clarification_question"] = (
                    "Necesito validar tu carrito antes de consultarlo. Vuelve a abrir la tienda e intenta de nuevo."
                )
        except Exception as exc:
            metrics.inc("ai_tool_errors_total")
            if str(tool) in {"clear_cart", "resolve_cart_item"} or action.get("then") in {
                "ADD_TO_CART",
                "REMOVE_FROM_CART",
                "UPDATE_CART_ITEM",
            }:
                metrics.inc("ai_cart_mutation_failures_total")
            state["error_code"] = "TOOL_FAILED"
            state["error_message"] = str(exc)
            self._log_node(state, "execute_authorized_tool", status="failed", tool_name=str(tool or ""))
            return state
        self._log_node(state, "execute_authorized_tool", tool_name=str(tool or ""))
        return state

    @staticmethod
    def _apply_tool_execution(
        state: AssistantState,
        execution: ToolExecution,
        *,
        count_cart_mutation: bool = False,
    ) -> None:
        if execution.cart:
            state["cart_snapshot"] = execution.cart.model_dump(mode="json")
        if execution.needs_clarification:
            if count_cart_mutation:
                metrics.inc("ai_cart_mutation_failures_total")
            state["clarification_required"] = True
            state["clarification_question"] = execution.clarification_question
            return
        if count_cart_mutation:
            metrics.inc("ai_cart_mutations_total")
        if execution.tool_name and execution.tool_name != "search_products":
            state["action_result"] = {
                "cart": execution.cart.model_dump(mode="json") if execution.cart else None,
                "idempotency_key": execution.idempotency_key,
                "tool_name": execution.tool_name,
                "target_entity_id": execution.target_entity_id,
                "normalized_arguments": execution.normalized_arguments,
            }

    @staticmethod
    def _last_product_list(messages: list[Any]) -> list[dict[str, Any]]:
        for message in reversed(messages):
            payload = getattr(message, "payload", {})
            summary = payload.get("context_summary") if isinstance(payload, dict) else None
            summary_products = summary.get("recent_products") if isinstance(summary, dict) else None
            if isinstance(summary_products, list) and summary_products:
                return [product for product in summary_products if isinstance(product, dict)]
            products = payload.get("products") if isinstance(payload, dict) else None
            if isinstance(products, list) and products:
                return [product for product in products if isinstance(product, dict)]
        return []

    async def _validate_tool_result(self, state: AssistantState) -> AssistantState:
        self._log_node(state, "validate_tool_result")
        return state

    async def _compose_response(self, state: AssistantState) -> AssistantState:
        locale = state.get("locale", "es")
        spanish = locale.lower().startswith("es")
        products = state.get("candidate_products") or []
        action_result = state.get("action_result") or {}
        cart = action_result.get("cart") or state.get("cart_snapshot")
        intent = state.get("intent", "UNSUPPORTED")

        if state.get("clarification_required"):
            message = state.get("clarification_question") or ("Necesito un poco mas de informacion." if spanish else "I need a bit more information.")
            action = AssistantAction(type="ASK_CLARIFICATION", status="PENDING", message=message)
        elif state.get("error_code"):
            message = "El asistente esta temporalmente ocupado. Puedes seguir navegando y utilizando el carrito normalmente." if spanish else "The assistant is temporarily busy. You can keep browsing and using the cart normally."
            action = AssistantAction(type="NONE", status="FAILED", message=state.get("error_code"))
        elif action_result.get("tool_name"):
            action = self._action_from_tool_result(action_result)
            if action_result.get("tool_name") == "get_product_variants":
                count = int(action_result.get("variant_count") or 0)
                message = (
                    f"Encontre {count} variante(s) disponible(s) para ese producto."
                    if spanish
                    else f"I found {count} available variant(s) for that product."
                )
            elif action_result.get("tool_name") == "compare_products":
                count = int(action_result.get("comparison_count") or 0)
                message = (
                    f"Compare {count} producto(s) usando detalles reales de Aether."
                    if spanish
                    else f"I compared {count} product(s) using real Aether details."
                )
            else:
                message = self._message_from_tool_result(action.type, cart, spanish)
        elif cart and intent == "CHECKOUT_REQUEST":
            message = "Puedo preparar tu carrito, pero el pago debe completarse en el checkout seguro de Aether." if spanish else "I can prepare your cart, but payment must be completed in Aether secure checkout."
            action = AssistantAction(type="OPEN_CART", status="SUCCEEDED")
        elif cart:
            count = cart.get("item_count", 0)
            message = f"Tu carrito tiene {count} producto(s)." if spanish else f"Your cart has {count} item(s)."
            action = AssistantAction(type="OPEN_CART", status="SUCCEEDED")
        elif products:
            message = "Encontre estas opciones reales en Aether." if spanish else "I found these real options in Aether."
            action = AssistantAction(type="PRODUCTS_LISTED", status="SUCCEEDED")
        else:
            message = (state.get("action_result") or {}).get("message") or ("No encontre coincidencias exactas." if spanish else "I did not find exact matches.")
            action = AssistantAction(type="NONE", status="NOT_REQUESTED")

        state["response"] = AssistantResponse(
            request_id=state["request_id"],
            thread_id=state["thread_id"],
            message=message,
            intent=intent,  # type: ignore[arg-type]
            products=products,
            cart=cart,
            action=action,
            suggested_replies=["Ver carrito", "Buscar ofertas"] if spanish else ["View cart", "Search deals"],
        )
        self._log_node(state, "compose_response", status="failed" if state.get("error_code") else "ok")
        return state

    @staticmethod
    def _action_from_tool_result(action_result: dict[str, Any]) -> AssistantAction:
        mapping = {
            "add_to_cart": "CART_ITEM_ADDED",
            "update_cart_item": "CART_ITEM_UPDATED",
            "remove_from_cart": "CART_ITEM_REMOVED",
            "clear_cart": "CART_CLEARED",
            "get_product_variants": "PRODUCTS_LISTED",
            "compare_products": "PRODUCTS_LISTED",
        }
        action_type = mapping.get(str(action_result.get("tool_name")), "OPEN_CART")
        return AssistantAction(
            type=action_type,  # type: ignore[arg-type]
            status="SUCCEEDED",
            entity_id=action_result.get("target_entity_id"),
            message=None,
        )

    @staticmethod
    def _message_from_tool_result(action_type: str, cart: dict[str, Any] | None, spanish: bool) -> str:
        count = int((cart or {}).get("item_count") or 0)
        if spanish:
            messages = {
                "CART_ITEM_ADDED": f"Listo. Agregue el producto al carrito. Ahora tienes {count} producto(s).",
                "CART_ITEM_UPDATED": f"Listo. Actualice la cantidad. Ahora tienes {count} producto(s) en el carrito.",
                "CART_ITEM_REMOVED": f"Listo. Quite el producto del carrito. Ahora tienes {count} producto(s).",
                "CART_CLEARED": "Listo. Vacie el carrito.",
            }
            return messages.get(action_type, f"Tu carrito tiene {count} producto(s).")
        messages = {
            "CART_ITEM_ADDED": f"Done. I added the product to your cart. You now have {count} item(s).",
            "CART_ITEM_UPDATED": f"Done. I updated the quantity. You now have {count} item(s) in your cart.",
            "CART_ITEM_REMOVED": f"Done. I removed the product from your cart. You now have {count} item(s).",
            "CART_CLEARED": "Done. I cleared the cart.",
        }
        return messages.get(action_type, f"Your cart has {count} item(s).")

    async def _persist_audit_event(self, state: AssistantState) -> AssistantState:
        action_result = state.get("action_result") or {}
        audit_event = state.get("audit_event")
        if action_result.get("tool_name") in {"add_to_cart", "update_cart_item", "remove_from_cart", "clear_cart"}:
            audit_event = {
                "tool_name": action_result["tool_name"],
                "normalized_arguments": action_result.get("normalized_arguments", "{}"),
                "target_entity_id": action_result.get("target_entity_id"),
                "idempotency_key": action_result.get("idempotency_key", ""),
                "authorization_result": "allowed",
                "execution_status": "failed" if state.get("error_code") else "succeeded",
                "error_code": state.get("error_code"),
            }
        if audit_event:
            await self.storage.audit_action(
                {
                    "event_id": idempotency_key(state["request_id"], "audit", audit_event.get("normalized_arguments", "")),
                    "request_id": state["request_id"],
                    "thread_id": state["thread_id"],
                    "user_or_session_hash": stable_hash(state.get("session_id")) or "anonymous",
                    "tool_name": audit_event["tool_name"],
                    "normalized_arguments": audit_event.get("normalized_arguments", "{}"),
                    "target_entity_id": audit_event.get("target_entity_id"),
                    "idempotency_key": audit_event.get("idempotency_key", ""),
                    "authorization_result": audit_event.get("authorization_result", "allowed"),
                    "execution_status": audit_event.get("execution_status", "succeeded"),
                    "error_code": audit_event.get("error_code"),
                }
            )
        self._log_node(state, "persist_audit_event")
        return state
