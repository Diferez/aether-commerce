import asyncio
from copy import deepcopy
import random
import time
from decimal import Decimal
from typing import Any
from urllib.parse import quote

import httpx

from app.schemas import CartSummary, ProductCard, ProductSearchArgs
from app.security import sanitize_external_text, sanitize_external_url


class AetherServiceUnavailable(RuntimeError):
    pass


class AetherApiClient:
    _failure_count = 0
    _circuit_open_until = 0.0

    def __init__(
        self,
        base_url: str,
        timeout_seconds: int = 10,
        *,
        max_retries: int = 2,
        circuit_failure_threshold: int = 3,
        circuit_reset_seconds: int = 30,
        catalog_cache_ttl_seconds: int = 60,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.circuit_failure_threshold = circuit_failure_threshold
        self.circuit_reset_seconds = circuit_reset_seconds
        self.catalog_cache_ttl_seconds = max(0, catalog_cache_ttl_seconds)
        self._catalog_cache: dict[str, tuple[float, dict[str, Any]]] = {}

    async def search_products(self, args: ProductSearchArgs) -> list[ProductCard]:
        params: dict[str, str] = {
            "page": "1",
            "pageSize": str(args.limit),
            "inStock": "true" if args.in_stock_only else "false",
        }
        search_terms = [args.query] if args.query else []
        if args.brands:
            search_terms.extend(args.brands)
        if search_terms:
            params["search"] = " ".join(term for term in search_terms if term)
        if args.category:
            params["category"] = args.category
        if args.min_price is not None:
            params["minPrice"] = str(int(args.min_price * 100))
        if args.max_price is not None:
            params["maxPrice"] = str(int(args.max_price * 100))
        if args.sort_by != "relevance":
            params["sort"] = args.sort_by

        payload = await self._get_catalog("/api/v1/catalog/products", params=params)
        return [self._to_product_card(item) for item in payload.get("data", [])][: args.limit]

    async def get_product_details(self, slug: str) -> dict[str, Any] | None:
        try:
            payload = await self._get_catalog(f"/api/v1/catalog/products/{slug}")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return None
            raise
        return payload.get("data")

    async def get_cart(self, cart_id: str, cart_token: str) -> CartSummary:
        payload = await self._get(
            f"/api/v1/cart/{quote(cart_id, safe='')}",
            headers={"x-aether-cart-token": cart_token},
        )
        return self._to_cart_summary(payload.get("data", {}))

    async def get_actor(self, authorization: str) -> dict[str, Any] | None:
        payload = await self._get("/api/v1/me", headers={"authorization": authorization})
        actor = payload.get("data")
        if not isinstance(actor, dict) or not actor.get("userId"):
            return None
        return actor

    async def add_to_cart(
        self,
        cart_id: str,
        product_slug: str,
        variant_id: str | None,
        quantity: int,
        cart_token: str,
        idempotency_key: str,
    ) -> CartSummary:
        payload = await self._post(
            f"/api/v1/cart/{quote(cart_id, safe='')}/items",
            json={"productId": product_slug, "variantId": variant_id, "quantity": quantity},
            headers={"x-aether-cart-token": cart_token, "x-idempotency-key": idempotency_key},
        )
        return self._to_cart_summary(payload.get("data", {}))

    async def remove_from_cart(
        self,
        cart_id: str,
        item_id: str,
        cart_token: str,
        idempotency_key: str,
    ) -> CartSummary:
        payload = await self._delete(
            f"/api/v1/cart/{quote(cart_id, safe='')}/items/{quote(item_id, safe='')}",
            headers={"x-aether-cart-token": cart_token, "x-idempotency-key": idempotency_key},
        )
        return self._to_cart_summary(payload.get("data", {}))

    async def update_cart_item(
        self,
        cart_id: str,
        item_id: str,
        quantity: int,
        cart_token: str,
        idempotency_key: str,
    ) -> CartSummary:
        payload = await self._patch(
            f"/api/v1/cart/{quote(cart_id, safe='')}/items/{quote(item_id, safe='')}",
            json={"quantity": quantity},
            headers={"x-aether-cart-token": cart_token, "x-idempotency-key": idempotency_key},
        )
        return self._to_cart_summary(payload.get("data", {}))

    async def clear_cart(self, cart_id: str, cart_token: str, idempotency_key: str) -> CartSummary:
        cart = await self.get_cart(cart_id, cart_token)
        for item in cart.items:
            item_id = item.get("slug") or item.get("variantId") or item.get("productId")
            if item_id:
                cart = await self.remove_from_cart(cart_id, str(item_id), cart_token, idempotency_key)
        return cart

    async def _get(
        self,
        path: str,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        return await self._request("GET", path, params=params, headers=headers, retry=True)

    async def _get_catalog(
        self,
        path: str,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        if self.catalog_cache_ttl_seconds <= 0:
            return await self._get(path, params=params)

        key = self._catalog_cache_key(path, params)
        now = time.time()
        cached = self._catalog_cache.get(key)
        if cached and cached[0] > now:
            return deepcopy(cached[1])

        payload = await self._get(path, params=params)
        self._catalog_cache[key] = (now + self.catalog_cache_ttl_seconds, deepcopy(payload))
        return payload

    @staticmethod
    def _catalog_cache_key(path: str, params: dict[str, str] | None = None) -> str:
        values = sorted((params or {}).items())
        return f"{path}?{values!r}"

    async def _post(
        self,
        path: str,
        json: dict[str, Any],
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        return await self._request("POST", path, json=json, headers=headers, retry=False)

    async def _delete(self, path: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
        return await self._request("DELETE", path, headers=headers, retry=False)

    async def _patch(
        self,
        path: str,
        json: dict[str, Any],
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        return await self._request("PATCH", path, json=json, headers=headers, retry=False)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        retry: bool,
    ) -> dict[str, Any]:
        now = time.time()
        if now < type(self)._circuit_open_until:
            raise AetherServiceUnavailable("Aether internal API circuit is open.")

        attempts = self.max_retries + 1 if retry else 1
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout_seconds) as client:
                    response = await client.request(method, path, params=params, json=json, headers=headers)
                    response.raise_for_status()
                    type(self)._failure_count = 0
                    return response.json()
            except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as exc:
                last_error = exc
                if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code < 500 and exc.response.status_code != 429:
                    raise
                type(self)._failure_count += 1
                if type(self)._failure_count >= self.circuit_failure_threshold:
                    type(self)._circuit_open_until = time.time() + self.circuit_reset_seconds
                if not retry or attempt == attempts - 1:
                    raise
                await asyncio.sleep(0.15 * (2**attempt) + random.uniform(0, 0.05))
        if last_error is not None:
            raise last_error
        raise AetherServiceUnavailable("Aether internal API request failed.")

    def _to_product_card(self, item: dict[str, Any]) -> ProductCard:
        return self.to_product_card(item)

    def to_product_card(self, item: dict[str, Any]) -> ProductCard:
        price_cents = int(item.get("finalPrice") or item.get("price") or 0)
        variants = item.get("variants") or []
        variant = variants[0] if variants else {}
        name = sanitize_external_text(item.get("name", ""), 140)
        description = sanitize_external_text(item.get("shortDescription") or item.get("description"), 280)
        return ProductCard(
            product_id=sanitize_external_text(item["id"], 80),
            variant_id=sanitize_external_text(variant.get("id"), 80) or None,
            name=name,
            description=description or None,
            price=Decimal(price_cents) / Decimal(100),
            currency="USD",
            image_url=sanitize_external_url((item.get("images") or [{}])[0].get("url") or item.get("thumbnail")),
            product_url=f"/products/detail?slug={quote(str(item.get('slug') or ''), safe='')}",
            available=int(item.get("availableStock") or 0) > 0,
            color=sanitize_external_text((variant.get("attributes") or {}).get("color") or (variant.get("attributes") or {}).get("finish"), 40) or None,
            size=sanitize_external_text((variant.get("attributes") or {}).get("size"), 40) or None,
            rating=(item.get("rating") or {}).get("average"),
        )

    def _to_cart_summary(self, cart: dict[str, Any]) -> CartSummary:
        items = cart.get("items") or []
        totals = cart.get("totals") or {}
        return CartSummary(
            item_count=sum(int(item.get("quantity") or 0) for item in items),
            subtotal=Decimal(int(totals.get("subtotal") or totals.get("total") or 0)) / Decimal(100),
            currency="USD",
            items=[self._sanitize_cart_item(item) for item in items],
        )

    @staticmethod
    def _sanitize_cart_item(item: dict[str, Any]) -> dict[str, Any]:
        sanitized = dict(item)
        for key in ["productId", "variantId", "name", "slug", "imageUrl", "currency"]:
            if key in sanitized:
                sanitized[key] = sanitize_external_text(sanitized[key], 180)
        if "imageUrl" in sanitized:
            sanitized["imageUrl"] = sanitize_external_url(sanitized["imageUrl"])
        return sanitized
