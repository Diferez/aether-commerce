from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


IntentName = Literal[
    "SEARCH_PRODUCTS",
    "RECOMMEND_PRODUCTS",
    "GET_PRODUCT_DETAILS",
    "COMPARE_PRODUCTS",
    "CHECK_VARIANT_AVAILABILITY",
    "GET_CART",
    "ADD_TO_CART",
    "UPDATE_CART_ITEM",
    "REMOVE_FROM_CART",
    "CLEAR_CART",
    "GENERAL_STORE_QUESTION",
    "CHECKOUT_REQUEST",
    "UNSUPPORTED",
]


class ClientContext(BaseModel):
    current_product_id: str | None = None
    current_product_slug: str | None = None
    current_category: str | None = None
    current_path: str | None = None


class AssistantMessageRequest(BaseModel):
    thread_id: UUID | None = None
    message: str = Field(min_length=1, max_length=20000)
    locale: str = "es-CO"
    currency: Literal["USD"] = "USD"
    client_context: ClientContext = Field(default_factory=ClientContext)


class ProductCard(BaseModel):
    product_id: str
    variant_id: str | None = None
    name: str
    description: str | None = None
    price: Decimal
    currency: Literal["USD"] = "USD"
    image_url: str | None = None
    product_url: str
    available: bool
    color: str | None = None
    size: str | None = None
    rating: float | None = None


class ProductVariant(BaseModel):
    variant_id: str
    label: str | None = None
    sku: str | None = None
    color: str | None = None
    size: str | None = None
    available: bool
    inventory: int = Field(default=0, ge=0)
    attributes: dict[str, str] = Field(default_factory=dict)


class CartSummary(BaseModel):
    item_count: int
    subtotal: Decimal
    currency: Literal["USD"] = "USD"
    items: list[dict[str, Any]] = Field(default_factory=list)


class AssistantAction(BaseModel):
    type: Literal[
        "NONE",
        "PRODUCTS_LISTED",
        "CART_ITEM_ADDED",
        "CART_ITEM_UPDATED",
        "CART_ITEM_REMOVED",
        "CART_CLEARED",
        "OPEN_CART",
        "OPEN_CHECKOUT",
        "ASK_CLARIFICATION",
    ] = "NONE"
    status: Literal["NOT_REQUESTED", "PENDING", "SUCCEEDED", "FAILED"] = "NOT_REQUESTED"
    entity_id: str | None = None
    message: str | None = None


class AssistantResponse(BaseModel):
    request_id: str
    thread_id: str
    message: str
    intent: IntentName
    products: list[ProductCard] = Field(default_factory=list)
    cart: CartSummary | None = None
    action: AssistantAction = Field(default_factory=AssistantAction)
    suggested_replies: list[str] = Field(default_factory=list)


class IntentResult(BaseModel):
    intent: IntentName
    confidence: float = Field(ge=0, le=1)
    referenced_position: int | None = None
    explanation: str


class ProductSearchArgs(BaseModel):
    query: str | None = None
    category: str | None = None
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    currency: Literal["USD"] = "USD"
    colors: list[str] | None = None
    sizes: list[str] | None = None
    brands: list[str] | None = None
    attributes: dict[str, str] | None = None
    in_stock_only: bool = True
    sort_by: Literal["relevance", "price_asc", "price_desc", "rating", "newest"] = "relevance"
    limit: int = Field(default=5, ge=1, le=10)
    cursor: str | None = None
