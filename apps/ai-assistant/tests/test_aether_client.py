import asyncio

import httpx

from app.clients.aether import AetherApiClient
from app.schemas import ProductSearchArgs


def test_aether_client_sends_cart_token_for_add_to_cart() -> None:
    async def run() -> None:
        captured_headers: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured_headers["x-aether-cart-token"] = request.headers.get("x-aether-cart-token", "")
            captured_headers["x-idempotency-key"] = request.headers.get("x-idempotency-key", "")
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {"items": [{"quantity": 1}], "totals": {"subtotal": 1200}},
                },
            )

        transport = httpx.MockTransport(handler)
        client = AetherApiClient("https://api.example.test")

        original_client = httpx.AsyncClient

        class MockedAsyncClient(httpx.AsyncClient):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, transport=transport, **kwargs)

        httpx.AsyncClient = MockedAsyncClient
        try:
            cart = await client.add_to_cart("cart-1", "product-1", None, 1, "signed-token", "idem-1")
        finally:
            httpx.AsyncClient = original_client

        assert captured_headers["x-aether-cart-token"] == "signed-token"
        assert captured_headers["x-idempotency-key"] == "idem-1"
        assert cart.item_count == 1

    asyncio.run(run())


def test_aether_client_sends_cart_token_for_update_item() -> None:
    async def run() -> None:
        captured: dict[str, object] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["method"] = request.method
            captured["path"] = request.url.path
            captured["token"] = request.headers.get("x-aether-cart-token", "")
            captured["idempotency"] = request.headers.get("x-idempotency-key", "")
            captured["body"] = request.read().decode("utf-8")
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {"items": [{"quantity": 3}], "totals": {"subtotal": 3600}},
                },
            )

        transport = httpx.MockTransport(handler)
        client = AetherApiClient("https://api.example.test")

        original_client = httpx.AsyncClient

        class MockedAsyncClient(httpx.AsyncClient):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, transport=transport, **kwargs)

        httpx.AsyncClient = MockedAsyncClient
        try:
            cart = await client.update_cart_item("cart-1", "item-1", 3, "signed-token", "idem-2")
        finally:
            httpx.AsyncClient = original_client

        assert captured["method"] == "PATCH"
        assert captured["path"] == "/api/v1/cart/cart-1/items/item-1"
        assert captured["token"] == "signed-token"
        assert captured["idempotency"] == "idem-2"
        assert captured["body"] == '{"quantity":3}'
        assert cart.item_count == 3

    asyncio.run(run())


def test_aether_client_resolves_authenticated_actor() -> None:
    async def run() -> None:
        captured_headers: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured_headers["authorization"] = request.headers.get("authorization", "")
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {"userId": "user_123", "email": "private@example.com", "roles": ["customer"]},
                },
            )

        transport = httpx.MockTransport(handler)
        client = AetherApiClient("https://api.example.test")
        original_client = httpx.AsyncClient

        class MockedAsyncClient(httpx.AsyncClient):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, transport=transport, **kwargs)

        httpx.AsyncClient = MockedAsyncClient
        try:
            actor = await client.get_actor("Bearer signed.jwt")
        finally:
            httpx.AsyncClient = original_client

        assert captured_headers["authorization"] == "Bearer signed.jwt"
        assert actor is not None
        assert actor["userId"] == "user_123"

    asyncio.run(run())


def test_aether_client_retries_catalog_reads() -> None:
    async def run() -> None:
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            if calls == 1:
                return httpx.Response(500, json={"success": False})
            return httpx.Response(200, json={"success": True, "data": []})

        transport = httpx.MockTransport(handler)
        client = AetherApiClient("https://api.example.test", max_retries=1)
        AetherApiClient._failure_count = 0
        AetherApiClient._circuit_open_until = 0

        original_client = httpx.AsyncClient

        class MockedAsyncClient(httpx.AsyncClient):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, transport=transport, **kwargs)

        httpx.AsyncClient = MockedAsyncClient
        try:
            products = await client.search_products(ProductSearchArgs(limit=5))
        finally:
            httpx.AsyncClient = original_client

        assert products == []
        assert calls == 2

    asyncio.run(run())


def test_aether_client_sends_catalog_filter_params() -> None:
    async def run() -> None:
        captured_query = ""

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal captured_query
            captured_query = request.url.query.decode("utf-8")
            return httpx.Response(200, json={"success": True, "data": []})

        transport = httpx.MockTransport(handler)
        client = AetherApiClient("https://api.example.test")
        original_client = httpx.AsyncClient

        class MockedAsyncClient(httpx.AsyncClient):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, transport=transport, **kwargs)

        httpx.AsyncClient = MockedAsyncClient
        try:
            await client.search_products(
                ProductSearchArgs(
                    query="running",
                    category="shoes",
                    min_price=20,
                    max_price=50,
                    brands=["aether"],
                    sort_by="price_asc",
                    limit=3,
                )
            )
        finally:
            httpx.AsyncClient = original_client

        assert "search=running+aether" in captured_query
        assert "category=shoes" in captured_query
        assert "minPrice=2000" in captured_query
        assert "maxPrice=5000" in captured_query
        assert "sort=price_asc" in captured_query
        assert "pageSize=3" in captured_query

    asyncio.run(run())


def test_aether_client_caches_catalog_reads_with_short_ttl() -> None:
    async def run() -> None:
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": [
                        {
                            "id": "prod-1",
                            "slug": "cached-product",
                            "name": f"Cached Product {calls}",
                            "price": 1200,
                            "finalPrice": 1200,
                            "availableStock": 2,
                            "images": [{"url": "https://cdn.example.test/product.jpg"}],
                            "variants": [],
                        }
                    ],
                },
            )

        transport = httpx.MockTransport(handler)
        client = AetherApiClient("https://api.example.test", catalog_cache_ttl_seconds=60)
        original_client = httpx.AsyncClient

        class MockedAsyncClient(httpx.AsyncClient):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, transport=transport, **kwargs)

        httpx.AsyncClient = MockedAsyncClient
        try:
            first = await client.search_products(ProductSearchArgs(limit=5))
            second = await client.search_products(ProductSearchArgs(limit=5))
        finally:
            httpx.AsyncClient = original_client

        assert calls == 1
        assert first[0].name == "Cached Product 1"
        assert second[0].name == "Cached Product 1"

    asyncio.run(run())


def test_aether_client_does_not_cache_cart_reads() -> None:
    async def run() -> None:
        calls = 0
        tokens: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            tokens.append(request.headers.get("x-aether-cart-token", ""))
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {"items": [{"quantity": calls}], "totals": {"subtotal": calls * 1200}},
                },
            )

        transport = httpx.MockTransport(handler)
        client = AetherApiClient("https://api.example.test", catalog_cache_ttl_seconds=60)
        original_client = httpx.AsyncClient

        class MockedAsyncClient(httpx.AsyncClient):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, transport=transport, **kwargs)

        httpx.AsyncClient = MockedAsyncClient
        try:
            first = await client.get_cart("cart-1", "signed-token")
            second = await client.get_cart("cart-1", "signed-token")
        finally:
            httpx.AsyncClient = original_client

        assert calls == 2
        assert tokens == ["signed-token", "signed-token"]
        assert first.item_count == 1
        assert second.item_count == 2

    asyncio.run(run())


def test_aether_client_sanitizes_untrusted_product_fields() -> None:
    product = AetherApiClient("https://api.example.test")._to_product_card(
        {
            "id": "prod-1",
            "slug": "safe-product",
            "name": "<b>Safe Product</b>",
            "shortDescription": "Mail owner@example.com and [click](https://evil.example)",
            "price": 1200,
            "finalPrice": 1200,
            "availableStock": 3,
            "thumbnail": "javascript:alert(1)",
            "images": [{"url": "javascript:alert(1)"}],
            "variants": [{"id": "var-1", "attributes": {"color": "<i>Red</i>", "size": "40"}}],
            "rating": {"average": 4.5},
        }
    )

    assert product.name == "Safe Product"
    assert "owner@example.com" not in (product.description or "")
    assert "https://evil.example" not in (product.description or "")
    assert product.image_url is None
    assert product.color == "Red"
