import asyncio

from app.schemas import CartSummary, ProductCard
from app.tools import (
    AetherAssistantTools,
    CLEAR_CART_CONFIRMATION_TOKEN,
    comparison_row,
    list_product_variants,
    resolve_cart_item,
    resolve_product_variant,
)


class FakeToolAetherClient:
    def __init__(self) -> None:
        self.added: tuple[str, str | None, int, str, str] | None = None
        self.cleared: tuple[str, str, str] | None = None

    async def search_products(self, args):
        return [
            ProductCard(
                product_id="prod-1",
                variant_id=None,
                name="Red Shoes",
                description="Running shoes",
                price=24,
                image_url=None,
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
            "price": 2400,
            "availableStock": 4,
            "variants": [
                {"id": "red-39", "label": "Red / 39", "inventory": 2, "attributes": {"color": "red", "size": "39"}},
                {"id": "red-40", "label": "Red / 40", "inventory": 2, "attributes": {"color": "red", "size": "40"}},
            ],
        }

    def to_product_card(self, item):
        return ProductCard(
            product_id=item["id"],
            variant_id=None,
            name=item["name"],
            description=item["description"],
            price=24,
            image_url=None,
            product_url=f"/products/detail?slug={item['slug']}",
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
        self.added = (product_slug, variant_id, quantity, cart_token, idempotency_key)
        return CartSummary(item_count=quantity, subtotal=24, items=[{"slug": product_slug, "quantity": quantity}])

    async def clear_cart(self, cart_id: str, cart_token: str, idempotency_key: str) -> CartSummary:
        self.cleared = (cart_id, cart_token, idempotency_key)
        return CartSummary(item_count=0, subtotal=0, items=[])


class FakeComparisonAetherClient(FakeToolAetherClient):
    def __init__(self) -> None:
        super().__init__()
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


def test_resolve_product_variant_requires_unambiguous_size() -> None:
    product = {
        "variants": [
            {"id": "red-39", "label": "Red / 39", "inventory": 2, "attributes": {"color": "red", "size": "39"}},
            {"id": "red-40", "label": "Red / 40", "inventory": 2, "attributes": {"color": "red", "size": "40"}},
        ]
    }

    ambiguous = resolve_product_variant(product, {"colors": ["red"]})
    resolved = resolve_product_variant(product, {"colors": ["red"], "sizes": ["40"]})

    assert ambiguous["status"] == "clarification"
    assert resolved["status"] == "resolved"
    assert resolved["variant_id"] == "red-40"


def test_list_product_variants_filters_available_color_and_size() -> None:
    product = {
        "variants": [
            {"id": "red-39", "label": "Red / 39", "inventory": 0, "attributes": {"color": "red", "size": "39"}},
            {"id": "red-40", "label": "Red / 40", "inventory": 2, "attributes": {"color": "red", "size": "40"}},
            {"id": "blue-40", "label": "Blue / 40", "inventory": 3, "attributes": {"color": "blue", "size": "40"}},
        ]
    }

    variants = list_product_variants(product, {"colors": ["red"], "sizes": ["40"]})

    assert len(variants) == 1
    assert variants[0].variant_id == "red-40"
    assert variants[0].available
    assert variants[0].inventory == 2


def test_comparison_row_uses_only_real_detail_fields() -> None:
    row = comparison_row(
        {
            "id": "prod-1",
            "slug": "red-shoes",
            "name": "Red Shoes",
            "price": 2400,
            "availableStock": 4,
            "category": "shoes",
            "rating": {"average": 4.5},
            "attributes": {"material": "mesh"},
        }
    )

    assert row["product_id"] == "prod-1"
    assert row["price"] == 2400
    assert row["available_stock"] == 4
    assert row["attributes"] == {"material": "mesh"}


def test_resolve_cart_item_uses_single_item_only_when_not_named() -> None:
    assert resolve_cart_item([], "quita ese") is None
    assert resolve_cart_item([{"slug": "red-shoes", "name": "Red Shoes"}], "quita ese")["slug"] == "red-shoes"
    assert resolve_cart_item(
        [{"slug": "red-shoes", "name": "Red Shoes"}, {"slug": "blue-shoes", "name": "Blue Shoes"}],
        "quita Blue Shoes",
    )["slug"] == "blue-shoes"
    assert resolve_cart_item(
        [{"slug": "red-shoes", "name": "Red Shoes"}, {"slug": "blue-shoes", "name": "Blue Shoes"}],
        "quita ese",
    ) is None


def test_tool_adds_recent_product_with_stable_idempotency_key() -> None:
    async def run() -> None:
        fake = FakeToolAetherClient()
        tools = AetherAssistantTools(fake)
        result = await tools.add_recent_product_to_cart(
            request_id="request-1",
            cart_id="cart-1",
            cart_token="token-1",
            recent_products=[
                {"product_id": "prod-1", "product_url": "/products/detail?slug=first"},
                {"product_id": "prod-2", "product_url": "/products/detail?slug=second"},
            ],
            referenced_position=2,
            quantity=2,
            constraints={"colors": ["red"], "sizes": ["40"]},
        )

        assert not result.needs_clarification
        assert result.tool_name == "add_to_cart"
        assert result.target_entity_id == "prod-2"
        assert result.idempotency_key is not None
        assert result.idempotency_key.startswith("ai_")
        assert fake.added == ("second", "red-40", 2, "token-1", result.idempotency_key)

    asyncio.run(run())


def test_tool_get_product_details_requires_variant_clarification() -> None:
    async def run() -> None:
        tools = AetherAssistantTools(FakeToolAetherClient())
        result = await tools.get_product_details({"query": "red shoes", "colors": ["red"]})

        assert result.needs_clarification
        assert result.tool_name == "get_product_details"
        assert result.products and result.products[0].product_id == "prod-1"
        assert "variantes" in result.clarification_question or "variants" in result.clarification_question

    asyncio.run(run())


def test_tool_get_product_variants_returns_filtered_structured_variants() -> None:
    async def run() -> None:
        tools = AetherAssistantTools(FakeToolAetherClient())
        result = await tools.get_product_variants({"query": "red shoes", "colors": ["red"], "sizes": ["40"]})

        assert not result.needs_clarification
        assert result.tool_name == "get_product_variants"
        assert result.products and result.products[0].product_id == "prod-1"
        assert result.variants and result.variants[0].variant_id == "red-40"

    asyncio.run(run())


def test_tool_compare_products_fetches_details_for_both_products() -> None:
    async def run() -> None:
        fake = FakeComparisonAetherClient()
        tools = AetherAssistantTools(fake)
        result = await tools.compare_products({"query": "shoes", "limit": 2})

        assert not result.needs_clarification
        assert result.tool_name == "compare_products"
        assert fake.detail_slugs == ["red-shoes", "blue-shoes"]
        assert result.products and len(result.products) == 2
        assert result.comparison and result.comparison[0]["attributes"]["material"] == "mesh"

    asyncio.run(run())


def test_tool_clear_cart_requires_confirmation_token() -> None:
    async def run() -> None:
        fake = FakeToolAetherClient()
        tools = AetherAssistantTools(fake)

        try:
            await tools.clear_cart(
                request_id="request-1",
                cart_id="cart-1",
                cart_token="token-1",
                confirmation_token="",
            )
        except ValueError as exc:
            assert str(exc) == "clear_cart_confirmation_required"
        else:
            raise AssertionError("clear_cart should require an explicit confirmation token")

        result = await tools.clear_cart(
            request_id="request-1",
            cart_id="cart-1",
            cart_token="token-1",
            confirmation_token=CLEAR_CART_CONFIRMATION_TOKEN,
        )

        assert result.tool_name == "clear_cart"
        assert result.normalized_arguments == f"cart-1:{CLEAR_CART_CONFIRMATION_TOKEN}"
        assert fake.cleared is not None
        assert fake.cleared[0] == "cart-1"
        assert fake.cleared[1] == "token-1"
        assert fake.cleared[2] == result.idempotency_key

    asyncio.run(run())
