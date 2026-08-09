from dataclasses import dataclass
from typing import Any

from app.clients.aether import AetherApiClient
from app.schemas import CartSummary, ProductCard, ProductSearchArgs, ProductVariant
from app.security import idempotency_key, sanitize_external_text

CLEAR_CART_CONFIRMATION_TOKEN = "confirmar-vaciar-carrito"


@dataclass(frozen=True)
class ToolExecution:
    cart: CartSummary | None = None
    products: list[ProductCard] | None = None
    variants: list[ProductVariant] | None = None
    comparison: list[dict[str, Any]] | None = None
    idempotency_key: str | None = None
    tool_name: str | None = None
    target_entity_id: str | None = None
    normalized_arguments: str | None = None
    clarification_question: str | None = None

    @property
    def needs_clarification(self) -> bool:
        return bool(self.clarification_question)


class AetherAssistantTools:
    def __init__(self, aether: AetherApiClient) -> None:
        self.aether = aether

    async def search_products(self, args: dict[str, Any]) -> ToolExecution:
        products = await self.aether.search_products(ProductSearchArgs(**args))
        return ToolExecution(products=products, tool_name="search_products")

    async def get_product_details(self, args: dict[str, Any]) -> ToolExecution:
        resolved = await self._resolve_single_product_detail(args, "get_product_details")
        if resolved.needs_clarification or not resolved.products:
            return resolved

        product_detail = await self._detail_from_product_card(resolved.products[0])
        if not product_detail:
            return ToolExecution(products=[], tool_name="get_product_details")

        variant_resolution = resolve_product_variant(product_detail, args)
        if variant_resolution["status"] != "resolved":
            return ToolExecution(
                products=[self.aether.to_product_card(product_detail)],
                tool_name="get_product_details",
                clarification_question=variant_resolution["message"],
            )
        return ToolExecution(products=[self.aether.to_product_card(product_detail)], tool_name="get_product_details")

    async def get_product_variants(self, args: dict[str, Any]) -> ToolExecution:
        resolved = await self._resolve_single_product_detail(args, "get_product_variants")
        if resolved.needs_clarification or not resolved.products:
            return resolved

        product_detail = await self._detail_from_product_card(resolved.products[0])
        if not product_detail:
            return ToolExecution(products=[], variants=[], tool_name="get_product_variants")

        variants = list_product_variants(product_detail, args)
        if not variants:
            return ToolExecution(
                products=[self.aether.to_product_card(product_detail)],
                variants=[],
                tool_name="get_product_variants",
                clarification_question="No encontre variantes disponibles con esos filtros.",
            )
        return ToolExecution(
            products=[self.aether.to_product_card(product_detail)],
            variants=variants,
            tool_name="get_product_variants",
        )

    async def compare_products(self, args: dict[str, Any]) -> ToolExecution:
        products = await self._comparison_candidates(args)
        if len(products) < 2:
            return ToolExecution(
                products=products,
                comparison=[],
                tool_name="compare_products",
                clarification_question="Necesito dos productos concretos para comparar. Cuales quieres revisar?",
            )
        if len(products) > 2:
            return ToolExecution(
                products=products[:5],
                comparison=[],
                tool_name="compare_products",
                clarification_question="Encontre varias opciones. Cuales dos productos quieres comparar?",
            )

        details: list[dict[str, Any]] = []
        detail_cards: list[ProductCard] = []
        for product in products:
            product_detail = await self._detail_from_product_card(product)
            if not product_detail:
                continue
            details.append(product_detail)
            detail_cards.append(self.aether.to_product_card(product_detail))
        if len(details) < 2:
            return ToolExecution(
                products=detail_cards,
                comparison=[],
                tool_name="compare_products",
                clarification_question="No pude obtener detalles suficientes de ambos productos para compararlos.",
            )
        return ToolExecution(
            products=detail_cards,
            comparison=[comparison_row(detail) for detail in details],
            tool_name="compare_products",
        )

    async def get_cart(self, cart_id: str, cart_token: str) -> ToolExecution:
        return ToolExecution(cart=await self.aether.get_cart(cart_id, cart_token), tool_name="get_cart")

    async def _resolve_single_product_detail(self, args: dict[str, Any], tool_name: str) -> ToolExecution:
        direct_slug = args.get("product_slug") or args.get("slug") or args.get("product_id")
        if direct_slug:
            product_detail = await self.aether.get_product_details(str(direct_slug))
            if not product_detail:
                return ToolExecution(products=[], tool_name=tool_name)
            return ToolExecution(products=[self.aether.to_product_card(product_detail)], tool_name=tool_name)

        products = await self.aether.search_products(ProductSearchArgs(**args))
        if not products:
            return ToolExecution(products=[], tool_name=tool_name)
        if len(products) > 1:
            return ToolExecution(
                products=products,
                tool_name=tool_name,
                clarification_question="Encontre varias coincidencias. Cual producto quieres revisar?",
            )
        return ToolExecution(products=products, tool_name=tool_name)

    async def _detail_from_product_card(self, product: ProductCard) -> dict[str, Any] | None:
        product_slug = product.product_url.rsplit("slug=", 1)[-1]
        return await self.aether.get_product_details(product_slug)

    async def _comparison_candidates(self, args: dict[str, Any]) -> list[ProductCard]:
        recent_products = args.get("recent_products")
        if isinstance(recent_products, list) and len(recent_products) >= 2:
            cards: list[ProductCard] = []
            for item in recent_products[:2]:
                if not isinstance(item, dict):
                    continue
                slug = str(item.get("product_url", "")).rsplit("slug=", 1)[-1] or str(item.get("product_id") or "")
                if not slug:
                    continue
                detail = await self.aether.get_product_details(slug)
                if detail:
                    cards.append(self.aether.to_product_card(detail))
            return cards
        return await self.aether.search_products(ProductSearchArgs(**{k: v for k, v in args.items() if k != "recent_products"}))

    async def add_single_search_result_to_cart(
        self,
        *,
        request_id: str,
        cart_id: str,
        cart_token: str,
        product: ProductCard,
        quantity: int,
        constraints: dict[str, Any],
    ) -> ToolExecution:
        product_slug = product.product_url.rsplit("slug=", 1)[-1]
        product_detail = await self.aether.get_product_details(product_slug)
        variant_resolution = resolve_product_variant(product_detail or {}, constraints)
        if variant_resolution["status"] != "resolved":
            return ToolExecution(clarification_question=variant_resolution["message"])

        variant_id = variant_resolution.get("variant_id")
        normalized_arguments = f"{product_slug}:{variant_id}:{quantity}"
        idem = idempotency_key(request_id, "add_to_cart", normalized_arguments)
        cart = await self.aether.add_to_cart(cart_id, product_slug, variant_id, quantity, cart_token, idem)
        return ToolExecution(
            cart=cart,
            idempotency_key=idem,
            tool_name="add_to_cart",
            target_entity_id=product.product_id,
            normalized_arguments=normalized_arguments,
        )

    async def add_recent_product_to_cart(
        self,
        *,
        request_id: str,
        cart_id: str,
        cart_token: str,
        recent_products: list[dict[str, Any]],
        referenced_position: int,
        quantity: int,
        constraints: dict[str, Any],
    ) -> ToolExecution:
        product = resolve_recent_product(recent_products, referenced_position)
        if product is None:
            return ToolExecution(
                clarification_question="No tengo una lista reciente valida para resolver esa referencia. Cual producto quieres agregar?"
            )

        product_slug = str(product.get("product_url", "")).rsplit("slug=", 1)[-1] or str(product.get("product_id"))
        product_detail = await self.aether.get_product_details(product_slug)
        variant_resolution = resolve_product_variant(product_detail or {}, constraints)
        if variant_resolution["status"] != "resolved":
            return ToolExecution(clarification_question=variant_resolution["message"])

        variant_id = variant_resolution.get("variant_id") or product.get("variant_id")
        normalized_arguments = f"{product_slug}:{variant_id}:{quantity}"
        idem = idempotency_key(request_id, "add_to_cart", normalized_arguments)
        cart = await self.aether.add_to_cart(
            cart_id,
            product_slug,
            str(variant_id) if variant_id else None,
            quantity,
            cart_token,
            idem,
        )
        return ToolExecution(
            cart=cart,
            idempotency_key=idem,
            tool_name="add_to_cart",
            target_entity_id=str(product.get("product_id") or ""),
            normalized_arguments=normalized_arguments,
        )

    async def clear_cart(
        self,
        *,
        request_id: str,
        cart_id: str,
        cart_token: str,
        confirmation_token: str,
    ) -> ToolExecution:
        if confirmation_token != CLEAR_CART_CONFIRMATION_TOKEN:
            raise ValueError("clear_cart_confirmation_required")

        normalized_arguments = f"{cart_id}:{confirmation_token}"
        idem = idempotency_key(request_id, "clear_cart", normalized_arguments)
        cart = await self.aether.clear_cart(cart_id, cart_token, idem)
        return ToolExecution(
            cart=cart,
            idempotency_key=idem,
            tool_name="clear_cart",
            target_entity_id=cart_id,
            normalized_arguments=normalized_arguments,
        )

    async def update_or_remove_cart_item(
        self,
        *,
        request_id: str,
        cart_id: str,
        cart_token: str,
        message: str,
        action: str,
        quantity: int,
    ) -> ToolExecution:
        current_cart = await self.aether.get_cart(cart_id, cart_token)
        item = resolve_cart_item(current_cart.items, message)
        if item is None:
            return ToolExecution(
                cart=current_cart,
                clarification_question="No encontre ese producto en tu carrito. Cual item quieres modificar?",
            )

        item_id = str(item.get("slug") or item.get("variantId") or item.get("productId"))
        if action == "REMOVE_FROM_CART":
            normalized_arguments = f"{item_id}:remove"
            idem = idempotency_key(request_id, "remove_from_cart", normalized_arguments)
            cart = await self.aether.remove_from_cart(cart_id, item_id, cart_token, idem)
            return ToolExecution(
                cart=cart,
                idempotency_key=idem,
                tool_name="remove_from_cart",
                target_entity_id=item_id,
                normalized_arguments=normalized_arguments,
            )

        normalized_arguments = f"{item_id}:quantity:{quantity}"
        idem = idempotency_key(request_id, "update_cart_item", normalized_arguments)
        cart = await self.aether.update_cart_item(cart_id, item_id, quantity, cart_token, idem)
        return ToolExecution(
            cart=cart,
            idempotency_key=idem,
            tool_name="update_cart_item",
            target_entity_id=item_id,
            normalized_arguments=normalized_arguments,
        )


def resolve_cart_item(items: list[dict[str, Any]], message: str) -> dict[str, Any] | None:
    if not items:
        return None
    lowered = message.lower()
    for item in items:
        values = [
            str(item.get("name") or ""),
            str(item.get("slug") or ""),
            str(item.get("productId") or ""),
            str(item.get("variantId") or ""),
        ]
        if any(value and value.lower() in lowered for value in values):
            return item
    if len(items) == 1:
        return items[0]
    return None


def resolve_recent_product(products: list[dict[str, Any]], referenced_position: int) -> dict[str, Any] | None:
    if referenced_position < 1:
        return None
    index = referenced_position - 1
    if index >= len(products):
        return None
    return products[index]


def resolve_product_variant(product: dict[str, Any], constraints: dict[str, Any]) -> dict[str, str | None]:
    variants = [variant for variant in product.get("variants", []) if int(variant.get("inventory") or 0) > 0]
    if not variants:
        return {"status": "resolved", "variant_id": None, "message": None}

    requested_colors = {str(color).lower() for color in constraints.get("colors") or []}
    requested_sizes = {str(size).lower() for size in constraints.get("sizes") or []}

    def variant_values(variant: dict[str, Any]) -> set[str]:
        attributes = variant.get("attributes") or {}
        values = {
            str(variant.get("id") or ""),
            str(variant.get("name") or ""),
            str(variant.get("value") or ""),
            str(variant.get("label") or ""),
            str(variant.get("sku") or ""),
        }
        values.update(str(value) for value in attributes.values())
        return {value.lower() for value in values if value}

    filtered = variants
    if requested_colors:
        filtered = [
            variant
            for variant in filtered
            if requested_colors & variant_values(variant)
            or requested_colors & {value.replace(" ", "-") for value in variant_values(variant)}
        ]
    if requested_sizes:
        filtered = [
            variant
            for variant in filtered
            if requested_sizes & variant_values(variant)
            or requested_sizes & {value.replace(" ", "-") for value in variant_values(variant)}
        ]

    if len(filtered) == 1:
        return {"status": "resolved", "variant_id": str(filtered[0].get("id") or ""), "message": None}

    if not filtered:
        return {
            "status": "clarification",
            "variant_id": None,
            "message": "No encontre una variante disponible con esa talla o color. Puedes escoger otra opcion?",
        }

    variant_labels = ", ".join(str(variant.get("label") or variant.get("name") or variant.get("id")) for variant in filtered[:5])
    return {
        "status": "clarification",
        "variant_id": None,
        "message": f"Este producto tiene varias variantes disponibles ({variant_labels}). Que talla o color prefieres?",
    }


def list_product_variants(product: dict[str, Any], constraints: dict[str, Any]) -> list[ProductVariant]:
    requested_colors = {str(color).lower() for color in constraints.get("colors") or []}
    requested_sizes = {str(size).lower() for size in constraints.get("sizes") or []}
    variants: list[ProductVariant] = []
    for variant in product.get("variants", []) or []:
        inventory = max(0, int(variant.get("inventory") or 0))
        attributes = {
            sanitize_external_text(key, 60): sanitize_external_text(value, 120)
            for key, value in (variant.get("attributes") or {}).items()
            if sanitize_external_text(key, 60)
        }
        color = attributes.get("color") or attributes.get("finish")
        size = attributes.get("size")
        values = {
            str(variant.get("id") or ""),
            str(variant.get("label") or ""),
            str(variant.get("name") or ""),
            str(variant.get("sku") or ""),
            *attributes.values(),
        }
        normalized_values = {sanitize_external_text(value, 120).lower() for value in values if value}
        if requested_colors and not (
            requested_colors & normalized_values
            or requested_colors & {value.replace(" ", "-") for value in normalized_values}
        ):
            continue
        if requested_sizes and not (
            requested_sizes & normalized_values
            or requested_sizes & {value.replace(" ", "-") for value in normalized_values}
        ):
            continue
        variants.append(
            ProductVariant(
                variant_id=sanitize_external_text(variant.get("id"), 80),
                label=sanitize_external_text(variant.get("label") or variant.get("name"), 120) or None,
                sku=sanitize_external_text(variant.get("sku"), 80) or None,
                color=color or None,
                size=size or None,
                available=inventory > 0,
                inventory=inventory,
                attributes=attributes,
            )
        )
    return [variant for variant in variants if variant.available]


def comparison_row(product: dict[str, Any]) -> dict[str, Any]:
    attributes: dict[str, str] = {}
    raw_attributes = product.get("attributes") or {}
    if isinstance(raw_attributes, dict):
        attributes = {
            sanitize_external_text(key, 60): sanitize_external_text(value, 160)
            for key, value in raw_attributes.items()
            if sanitize_external_text(key, 60) and sanitize_external_text(value, 160)
        }
    return {
        "product_id": sanitize_external_text(product.get("id"), 80),
        "slug": sanitize_external_text(product.get("slug"), 120),
        "name": sanitize_external_text(product.get("name"), 140),
        "price": int(product.get("finalPrice") or product.get("price") or 0),
        "currency": "USD",
        "category": sanitize_external_text(product.get("category") or product.get("normalizedCategory"), 80) or None,
        "available_stock": max(0, int(product.get("availableStock") or 0)),
        "rating": (product.get("rating") or {}).get("average") if isinstance(product.get("rating"), dict) else None,
        "attributes": attributes,
    }
