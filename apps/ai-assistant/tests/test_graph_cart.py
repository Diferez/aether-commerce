import asyncio
import base64
import hashlib
import hmac
import json

from app.cart_token import verify_cart_token
from app.graph import AssistantGraph
from app.schemas import AssistantMessageRequest, CartSummary, ProductCard
from app.config import Settings
from app.storage import InMemoryAssistantStorage


def sign(secret: str, payload: dict[str, object]) -> str:
    encoded_payload = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii").rstrip("=")
    signature = hmac.new(secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{encoded_payload}.{encoded_signature}"


class FakeAetherClient:
    def __init__(self) -> None:
        self.updated: tuple[str, int, str, str] | None = None
        self.removed: tuple[str, str, str] | None = None
        self.cleared: tuple[str, str, str] | None = None
        self.cart_read_tokens: list[str] = []

    async def get_cart(self, cart_id: str, cart_token: str) -> CartSummary:
        self.cart_read_tokens.append(cart_token)
        return CartSummary(
            item_count=1,
            subtotal=12,
            items=[
                {
                    "productId": "prod-1",
                    "variantId": "var-1",
                    "slug": "red-shoes",
                    "name": "Red Shoes",
                    "quantity": 1,
                    "finalUnitPrice": 1200,
                    "lineTotal": 1200,
                }
            ],
        )

    async def update_cart_item(
        self,
        cart_id: str,
        item_id: str,
        quantity: int,
        cart_token: str,
        idempotency_key: str,
    ) -> CartSummary:
        self.updated = (item_id, quantity, cart_token, idempotency_key)
        return CartSummary(item_count=quantity, subtotal=36, items=[{"slug": item_id, "quantity": quantity}])

    async def remove_from_cart(
        self,
        cart_id: str,
        item_id: str,
        cart_token: str,
        idempotency_key: str,
    ) -> CartSummary:
        self.removed = (item_id, cart_token, idempotency_key)
        return CartSummary(item_count=0, subtotal=0, items=[])

    async def clear_cart(self, cart_id: str, cart_token: str, idempotency_key: str) -> CartSummary:
        self.cleared = (cart_id, cart_token, idempotency_key)
        return CartSummary(item_count=0, subtotal=0, items=[])


class FakeVariantAetherClient:
    def __init__(self) -> None:
        self.added: tuple[str, str | None, int, str] | None = None

    async def search_products(self, args):
        return [
            ProductCard(
                product_id="prod-1",
                variant_id="var-39",
                name="Red Shoes",
                description="Running shoes",
                price=12,
                product_url="/products/detail?slug=red-shoes",
                available=True,
            )
        ]

    async def get_product_details(self, slug: str):
        return {
            "id": "prod-1",
            "slug": slug,
            "name": "Red Shoes",
            "description": "Running shoes",
            "price": 1200,
            "availableStock": 5,
            "variants": [
                {
                    "id": "var-39",
                    "label": "Red / 39",
                    "inventory": 5,
                    "attributes": {"color": "red", "size": "39"},
                },
                {
                    "id": "var-40",
                    "label": "Red / 40",
                    "inventory": 3,
                    "attributes": {"color": "red", "size": "40"},
                },
            ],
        }

    def to_product_card(self, item):
        return ProductCard(
            product_id=item.get("id", "prod-1"),
            variant_id=None,
            name=item.get("name", "Red Shoes"),
            description=item.get("description"),
            price=12,
            product_url=f"/products/detail?slug={item.get('slug', 'red-shoes')}",
            available=True,
        )

    async def add_to_cart(
        self,
        cart_id: str,
        product_slug: str,
        variant_id: str | None,
        quantity: int,
        cart_token: str,
        idempotency_key: str,
    ) -> CartSummary:
        self.added = (product_slug, variant_id, quantity, idempotency_key)
        return CartSummary(item_count=quantity, subtotal=12, items=[{"slug": product_slug, "variantId": variant_id, "quantity": quantity}])


def test_graph_contains_required_control_nodes() -> None:
    graph = AssistantGraph(Settings(), FakeAetherClient(), InMemoryAssistantStorage())
    nodes = set(graph.graph.nodes)

    assert {
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
    }.issubset(nodes)


class FakeRecentProductAetherClient:
    def __init__(self) -> None:
        self.added: tuple[str, str | None, int, str] | None = None

    async def get_product_details(self, slug: str):
        return {"slug": slug, "variants": []}

    async def add_to_cart(
        self,
        cart_id: str,
        product_slug: str,
        variant_id: str | None,
        quantity: int,
        cart_token: str,
        idempotency_key: str,
    ) -> CartSummary:
        self.added = (product_slug, variant_id, quantity, cart_token)
        return CartSummary(item_count=quantity, subtotal=10, items=[{"slug": product_slug, "quantity": quantity}])


class FakeComparisonAetherClient:
    def __init__(self) -> None:
        self.detail_slugs: list[str] = []

    async def search_products(self, args):
        return [
            ProductCard(
                product_id="prod-1",
                variant_id=None,
                name="Red Shoes",
                description="Running shoes",
                price=24,
                product_url="/products/detail?slug=red-shoes",
                available=True,
            ),
            ProductCard(
                product_id="prod-2",
                variant_id=None,
                name="Blue Shoes",
                description="Walking shoes",
                price=32,
                product_url="/products/detail?slug=blue-shoes",
                available=True,
            ),
        ]

    async def get_product_details(self, slug: str):
        self.detail_slugs.append(slug)
        return {
            "id": "prod-1" if slug == "red-shoes" else "prod-2",
            "slug": slug,
            "name": "Red Shoes" if slug == "red-shoes" else "Blue Shoes",
            "description": "Running shoes" if slug == "red-shoes" else "Walking shoes",
            "price": 2400 if slug == "red-shoes" else 3200,
            "availableStock": 4 if slug == "red-shoes" else 2,
            "category": "shoes",
            "rating": {"average": 4.5 if slug == "red-shoes" else 4.1},
            "attributes": {"material": "mesh" if slug == "red-shoes" else "leather"},
            "variants": [],
        }

    def to_product_card(self, item):
        return ProductCard(
            product_id=item["id"],
            variant_id=None,
            name=item["name"],
            description=item["description"],
            price=int(item["price"]) / 100,
            product_url=f"/products/detail?slug={item['slug']}",
            available=int(item["availableStock"]) > 0,
        )


class FakeSimilarContextAetherClient:
    def __init__(self) -> None:
        self.detail_slugs: list[str] = []
        self.search_categories: list[str | None] = []

    async def get_product_details(self, slug: str):
        self.detail_slugs.append(slug)
        return {
            "id": "prod-current",
            "slug": slug,
            "name": "Current Shoes",
            "description": "Current product",
            "price": 2000,
            "availableStock": 3,
            "category": {"slug": "shoes"},
            "variants": [],
        }

    async def search_products(self, args):
        self.search_categories.append(args.category)
        return [
            ProductCard(
                product_id="prod-alt",
                variant_id=None,
                name="Alternative Shoes",
                description="Alternative product",
                price=22,
                product_url="/products/detail?slug=alternative-shoes",
                available=True,
            )
        ]


def test_graph_updates_single_cart_item_from_current_cart() -> None:
    async def run() -> None:
        secret = "secret"
        token = sign(secret, {"cartId": "cart-1", "exp": 9999999999})
        assert verify_cart_token(token, secret, "cart-1")
        settings = Settings(aether_cart_token_secret=secret, ai_mutation_confidence_threshold=0.9)
        storage = InMemoryAssistantStorage()
        fake = FakeAetherClient()
        graph = AssistantGraph(settings, fake, storage)

        response = await graph.run(
            AssistantMessageRequest(
                message="Cambia la cantidad a 3",
                locale="es-CO",
                currency="USD",
            ),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=token,
        )

        assert response.intent == "UPDATE_CART_ITEM"
        assert response.action.type == "CART_ITEM_UPDATED"
        assert response.action.entity_id == "red-shoes"
        assert response.cart is not None
        assert response.cart.item_count == 3
        assert fake.updated is not None
        assert fake.cart_read_tokens == [token]
        assert fake.updated[0] == "red-shoes"
        assert fake.updated[1] == 3
        assert fake.updated[2] == token
        assert fake.updated[3].startswith("ai_")
        assert storage.audit_events[0]["tool_name"] == "update_cart_item"

    asyncio.run(run())


def test_graph_persists_hashed_user_identity_when_authenticated() -> None:
    async def run() -> None:
        settings = Settings(aether_cart_token_secret="secret")
        storage = InMemoryAssistantStorage()
        graph = AssistantGraph(settings, FakeAetherClient(), storage)

        response = await graph.run(
            AssistantMessageRequest(message="Hola", locale="es-CO", currency="USD"),
            cart_id=None,
            session_id="session-1",
            cart_token=None,
            user_id="user_123",
        )

        assert response.intent == "GENERAL_STORE_QUESTION"
        conversation = storage.conversations[response.thread_id]
        assert conversation["user_id"] != "user_123"
        assert conversation["user_id"]

    asyncio.run(run())


def test_graph_respects_disabled_conversation_storage() -> None:
    async def run() -> None:
        settings = Settings(aether_cart_token_secret="secret", ai_store_conversations=False)
        storage = InMemoryAssistantStorage()
        graph = AssistantGraph(settings, FakeAetherClient(), storage)

        response = await graph.run(
            AssistantMessageRequest(message="Hola", locale="es-CO", currency="USD"),
            cart_id=None,
            session_id="session-1",
            cart_token=None,
            user_id="user_123",
        )

        assert response.intent == "GENERAL_STORE_QUESTION"
        assert response.thread_id
        assert storage.conversations == {}
        assert storage.messages == {}

    asyncio.run(run())


def test_graph_removes_single_cart_item_from_current_cart() -> None:
    async def run() -> None:
        secret = "secret"
        token = sign(secret, {"cartId": "cart-1", "exp": 9999999999})
        settings = Settings(aether_cart_token_secret=secret, ai_mutation_confidence_threshold=0.9)
        storage = InMemoryAssistantStorage()
        fake = FakeAetherClient()
        graph = AssistantGraph(settings, fake, storage)

        response = await graph.run(
            AssistantMessageRequest(
                message="Quita Red Shoes",
                locale="es-CO",
                currency="USD",
            ),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=token,
        )

        assert response.intent == "REMOVE_FROM_CART"
        assert response.action.type == "CART_ITEM_REMOVED"
        assert response.action.entity_id == "red-shoes"
        assert response.cart is not None
        assert response.cart.item_count == 0
        assert fake.removed is not None
        assert fake.cart_read_tokens == [token]
        assert fake.removed[0] == "red-shoes"
        assert fake.removed[1] == token
        assert fake.removed[2].startswith("ai_")
        assert storage.audit_events[0]["tool_name"] == "remove_from_cart"

    asyncio.run(run())


def test_graph_asks_clarification_for_ambiguous_product_variant() -> None:
    async def run() -> None:
        token = sign("secret", {"cartId": "cart-1", "exp": 9999999999})
        settings = Settings(aether_cart_token_secret="secret")
        fake = FakeVariantAetherClient()
        graph = AssistantGraph(settings, fake, InMemoryAssistantStorage())

        response = await graph.run(
            AssistantMessageRequest(message="Agrega Red Shoes", locale="es-CO", currency="USD"),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=token,
        )

        assert response.action.type == "ASK_CLARIFICATION"
        assert fake.added is None
        assert "variantes" in response.message

    asyncio.run(run())


def test_graph_adds_matching_variant_when_size_is_explicit() -> None:
    async def run() -> None:
        token = sign("secret", {"cartId": "cart-1", "exp": 9999999999})
        settings = Settings(aether_cart_token_secret="secret")
        fake = FakeVariantAetherClient()
        graph = AssistantGraph(settings, fake, InMemoryAssistantStorage())

        response = await graph.run(
            AssistantMessageRequest(message="Agrega Red Shoes talla 40", locale="es-CO", currency="USD"),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=token,
        )

        assert response.cart is not None
        assert response.action.type == "CART_ITEM_ADDED"
        assert fake.added is not None
        assert fake.added[1] == "var-40"
        assert fake.added[2] == 1

    asyncio.run(run())


def test_graph_checks_variant_availability_without_cart_audit() -> None:
    async def run() -> None:
        storage = InMemoryAssistantStorage()
        graph = AssistantGraph(Settings(aether_cart_token_secret="secret"), FakeVariantAetherClient(), storage)

        response = await graph.run(
            AssistantMessageRequest(message="Tienen Red Shoes talla 40?", locale="es-CO", currency="USD"),
            cart_id=None,
            session_id="session-1",
            cart_token=None,
        )

        assert response.intent == "CHECK_VARIANT_AVAILABILITY"
        assert response.action.type == "PRODUCTS_LISTED"
        assert "variante" in response.message
        assert storage.audit_events == []

    asyncio.run(run())


def test_graph_compares_products_from_detail_records_without_cart_audit() -> None:
    async def run() -> None:
        fake = FakeComparisonAetherClient()
        storage = InMemoryAssistantStorage()
        graph = AssistantGraph(Settings(aether_cart_token_secret="secret"), fake, storage)

        response = await graph.run(
            AssistantMessageRequest(message="Compara Red Shoes y Blue Shoes", locale="es-CO", currency="USD"),
            cart_id=None,
            session_id="session-1",
            cart_token=None,
        )

        assert response.intent == "COMPARE_PRODUCTS"
        assert response.action.type == "PRODUCTS_LISTED"
        assert len(response.products) == 2
        assert fake.detail_slugs == ["red-shoes", "blue-shoes"]
        assert storage.audit_events == []

    asyncio.run(run())


def test_graph_uses_current_product_category_for_similar_recommendations() -> None:
    async def run() -> None:
        fake = FakeSimilarContextAetherClient()
        graph = AssistantGraph(Settings(), fake, InMemoryAssistantStorage())

        response = await graph.run(
            AssistantMessageRequest(
                message="Muestrame alternativas similares",
                locale="es-CO",
                currency="USD",
                client_context={"current_product_slug": "current-shoes"},
            ),
            cart_id=None,
            session_id="session-1",
            cart_token=None,
        )

        assert response.intent == "RECOMMEND_PRODUCTS"
        assert response.products[0].product_id == "prod-alt"
        assert fake.detail_slugs == ["current-shoes"]
        assert fake.search_categories == ["shoes"]

    asyncio.run(run())


def test_graph_adds_second_recent_product_by_reference() -> None:
    async def run() -> None:
        secret = "secret"
        token = sign(secret, {"cartId": "cart-1", "exp": 9999999999})
        storage = InMemoryAssistantStorage()
        thread_id = "00000000-0000-4000-8000-000000000111"
        await storage.ensure_conversation(thread_id, "session-hash", None, "es-CO", 30)
        await storage.save_message(
            thread_id,
            "assistant",
            None,
            {
                "products": [
                    {"product_id": "prod-1", "variant_id": None, "product_url": "/products/detail?slug=first-item"},
                    {"product_id": "prod-2", "variant_id": None, "product_url": "/products/detail?slug=second-item"},
                ]
            },
        )
        fake = FakeRecentProductAetherClient()
        graph = AssistantGraph(Settings(aether_cart_token_secret=secret), fake, storage)

        response = await graph.run(
            AssistantMessageRequest(
                thread_id=thread_id,
                message="Agrega el segundo",
                locale="es-CO",
                currency="USD",
            ),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=token,
        )

        assert response.action.type == "CART_ITEM_ADDED"
        assert fake.added is not None
        assert fake.added[0] == "second-item"
        assert fake.added[2] == 1
        assert fake.added[3] == token

    asyncio.run(run())


def test_graph_compacts_recent_product_references_across_turns() -> None:
    async def run() -> None:
        secret = "secret"
        token = sign(secret, {"cartId": "cart-1", "exp": 9999999999})
        storage = InMemoryAssistantStorage()
        thread_id = "00000000-0000-4000-8000-000000000222"
        await storage.ensure_conversation(thread_id, "session-hash", None, "es-CO", 30)
        await storage.save_message(
            thread_id,
            "assistant",
            None,
            {
                "products": [
                    {"product_id": "prod-1", "variant_id": None, "product_url": "/products/detail?slug=first-item"},
                    {"product_id": "prod-2", "variant_id": None, "product_url": "/products/detail?slug=second-item"},
                ]
            },
        )
        graph = AssistantGraph(
            Settings(aether_cart_token_secret=secret, ai_max_conversation_messages=1),
            FakeRecentProductAetherClient(),
            storage,
        )

        general = await graph.run(
            AssistantMessageRequest(thread_id=thread_id, message="Gracias", locale="es-CO", currency="USD"),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=token,
        )
        assert general.action.type == "NONE"
        assert storage.messages[thread_id][-1].payload["context_summary"]["recent_products"][1]["product_id"] == "prod-2"

        fake = FakeRecentProductAetherClient()
        graph = AssistantGraph(
            Settings(aether_cart_token_secret=secret, ai_max_conversation_messages=1),
            fake,
            storage,
        )
        response = await graph.run(
            AssistantMessageRequest(thread_id=thread_id, message="Agrega el segundo", locale="es-CO", currency="USD"),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=token,
        )

        assert response.action.type == "CART_ITEM_ADDED"
        assert fake.added is not None
        assert fake.added[0] == "second-item"

    asyncio.run(run())


def test_graph_does_not_resolve_recent_reference_without_previous_products() -> None:
    async def run() -> None:
        secret = "secret"
        token = sign(secret, {"cartId": "cart-1", "exp": 9999999999})
        fake = FakeRecentProductAetherClient()
        graph = AssistantGraph(Settings(aether_cart_token_secret=secret), fake, InMemoryAssistantStorage())

        response = await graph.run(
            AssistantMessageRequest(message="Agrega el segundo", locale="es-CO", currency="USD"),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=token,
        )

        assert response.action.type == "ASK_CLARIFICATION"
        assert fake.added is None

    asyncio.run(run())


def test_graph_audits_denied_cart_mutation_without_valid_token() -> None:
    async def run() -> None:
        storage = InMemoryAssistantStorage()
        fake = FakeVariantAetherClient()
        graph = AssistantGraph(Settings(aether_cart_token_secret="secret"), fake, storage)

        response = await graph.run(
            AssistantMessageRequest(message="Agrega Red Shoes talla 40", locale="es-CO", currency="USD"),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=None,
        )

        assert response.action.type == "ASK_CLARIFICATION"
        assert fake.added is None
        assert len(storage.audit_events) == 1
        event = storage.audit_events[0]
        assert event["authorization_result"] == "denied"
        assert event["execution_status"] == "blocked"
        assert event["error_code"] == "CART_NOT_AUTHORIZED"

    asyncio.run(run())


def test_graph_does_not_show_cart_without_valid_token() -> None:
    async def run() -> None:
        storage = InMemoryAssistantStorage()
        fake = FakeAetherClient()
        graph = AssistantGraph(Settings(aether_cart_token_secret="secret"), fake, storage)

        response = await graph.run(
            AssistantMessageRequest(message="Que tengo en mi carrito?", locale="es-CO", currency="USD"),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=None,
        )

        assert response.intent == "GET_CART"
        assert response.action.type == "ASK_CLARIFICATION"
        assert response.cart is None
        assert "validar tu carrito" in response.message

    asyncio.run(run())


def test_graph_does_not_open_checkout_without_valid_cart_token() -> None:
    async def run() -> None:
        storage = InMemoryAssistantStorage()
        fake = FakeAetherClient()
        graph = AssistantGraph(Settings(aether_cart_token_secret="secret"), fake, storage)

        response = await graph.run(
            AssistantMessageRequest(message="Quiero pagar", locale="es-CO", currency="USD"),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=None,
        )

        assert response.intent == "CHECKOUT_REQUEST"
        assert response.action.type == "ASK_CLARIFICATION"
        assert response.cart is None
        assert "validar tu carrito" in response.message

    asyncio.run(run())


def test_graph_audits_clear_cart_without_confirmation() -> None:
    async def run() -> None:
        secret = "secret"
        token = sign(secret, {"cartId": "cart-1", "exp": 9999999999})
        storage = InMemoryAssistantStorage()
        fake = FakeAetherClient()
        graph = AssistantGraph(Settings(aether_cart_token_secret=secret), fake, storage)

        response = await graph.run(
            AssistantMessageRequest(message="Vacia el carrito", locale="es-CO", currency="USD"),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=token,
        )

        assert response.action.type == "ASK_CLARIFICATION"
        assert len(storage.audit_events) == 1
        event = storage.audit_events[0]
        assert event["tool_name"] == "clear_cart"
        assert event["authorization_result"] == "denied"
        assert event["execution_status"] == "blocked"
        assert event["error_code"] == "CONFIRMATION_REQUIRED"

    asyncio.run(run())


def test_graph_clears_cart_only_after_explicit_confirmation() -> None:
    async def run() -> None:
        secret = "secret"
        token = sign(secret, {"cartId": "cart-1", "exp": 9999999999})
        storage = InMemoryAssistantStorage()
        fake = FakeAetherClient()
        graph = AssistantGraph(Settings(aether_cart_token_secret=secret), fake, storage)

        response = await graph.run(
            AssistantMessageRequest(message="Confirmar vaciar carrito", locale="es-CO", currency="USD"),
            cart_id="cart-1",
            session_id="session-1",
            cart_token=token,
        )

        assert response.intent == "CLEAR_CART"
        assert response.action.type == "CART_CLEARED"
        assert response.cart is not None
        assert response.cart.item_count == 0
        assert fake.cleared is not None
        assert fake.cleared[0] == "cart-1"
        assert fake.cleared[1] == token
        assert fake.cleared[2].startswith("ai_")
        assert storage.audit_events[0]["tool_name"] == "clear_cart"
        assert storage.audit_events[0]["authorization_result"] == "allowed"

    asyncio.run(run())
