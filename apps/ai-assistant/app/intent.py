import re
import unicodedata
from typing import Any

from app.schemas import IntentResult


MAX_PRICE_RE = re.compile(r"(?:menos de|menores a|under|below|max(?:imo)?|hasta)\s*\$?\s*(\d+(?:[.,]\d+)?)", re.IGNORECASE)
MIN_PRICE_RE = re.compile(r"(?:mas de|mayor(?:es)? a|desde|min(?:imo)?|above|over|from)\s*\$?\s*(\d+(?:[.,]\d+)?)", re.IGNORECASE)
QUANTITY_RE = re.compile(r"\b(\d+)\b")
SIZE_RE = re.compile(r"\b(?:talla|size)\s*([a-z0-9.-]+)\b", re.IGNORECASE)
BRAND_RE = re.compile(r"\b(?:marca|brand)\s+([a-z0-9][a-z0-9 -]{1,40})", re.IGNORECASE)
LIMIT_RE = re.compile(r"\b(?:muestra|show|ver|dame)?\s*(\d{1,2})\s+(?:productos|opciones|items|results)\b", re.IGNORECASE)

QUANTITY_WORDS = {
    "un": 1,
    "una": 1,
    "uno": 1,
    "two": 2,
    "dos": 2,
    "three": 3,
    "tres": 3,
    "four": 4,
    "cuatro": 4,
    "five": 5,
    "cinco": 5,
}
COLOR_ALIASES = {
    "black": "black",
    "negro": "black",
    "white": "white",
    "blanco": "white",
    "red": "red",
    "rojo": "red",
    "roja": "red",
    "rojos": "red",
    "rojas": "red",
    "blue": "blue",
    "azul": "blue",
    "green": "green",
    "verde": "green",
    "gray": "gray",
    "grey": "gray",
    "gris": "gray",
    "graphite": "graphite",
    "grafito": "graphite",
    "titanium": "titanium",
    "titanio": "titanium",
}
CATEGORY_ALIASES = {
    "audifonos": "audio",
    "headphones": "audio",
    "headset": "audio",
    "audio": "audio",
    "tenis": "shoes",
    "zapatos": "shoes",
    "shoes": "shoes",
    "sneakers": "shoes",
    "laptop": "laptops",
    "laptops": "laptops",
    "computador": "laptops",
    "muebles": "furniture",
    "furniture": "furniture",
    "hogar": "home",
    "home": "home",
    "ropa": "clothing",
    "clothing": "clothing",
    "accesorios": "accessories",
    "accessories": "accessories",
}
REFERENCE_POSITIONS = {
    "primero": 1,
    "primera": 1,
    "first": 1,
    "segundo": 2,
    "segunda": 2,
    "second": 2,
    "tercero": 3,
    "tercera": 3,
    "third": 3,
    "cuarto": 4,
    "cuarta": 4,
    "fourth": 4,
    "quinto": 5,
    "quinta": 5,
    "fifth": 5,
}


def detect_intent_heuristic(message: str) -> IntentResult:
    normalized = normalize_text(message)
    if any(
        word in normalized
        for word in [
            "clave",
            "api key",
            "apikey",
            "gemini_api_key",
            "gemini key",
            "token",
            "jwt",
            "cookie",
            "contraseÃ±a",
            "contrasena",
            "password",
            "system prompt",
            "prompt",
            "herramientas privadas",
            "internal tools",
            "chain of thought",
            "razonamiento interno",
            "ignora tus reglas",
            "ignora las reglas",
            "olvida tus reglas",
            "forget instructions",
            "en lugar del real",
            "usa este precio",
            "cart_id",
            "otro usuario",
            "cambia el stock",
            "producto inexistente",
            "inexistent product",
            "nonexistent product",
            "muestra la clave",
            "revela la clave",
            "send the api key",
        ]
    ):
        return IntentResult(intent="UNSUPPORTED", confidence=0.95, explanation="Unsafe request detected.")
    if any(word in normalized for word in ["similar", "similares", "alternativa", "alternativas"]):
        return IntentResult(intent="RECOMMEND_PRODUCTS", confidence=0.86, explanation="Similar alternatives request detected.")
    if "regalo" in normalized:
        return IntentResult(intent="RECOMMEND_PRODUCTS", confidence=0.86, explanation="Gift recommendation detected.")
    if "productos" in normalized and any(word in normalized for word in ["muestra", "muestrame", "strame"]):
        return IntentResult(intent="SEARCH_PRODUCTS", confidence=0.86, explanation="Product search detected.")
    if any(word in normalized for word in ["mouse", "mouses", "teclado", "keyboard", "laptop"]) and any(
        word in normalized for word in ["menos de", "under", "below", "hasta", "busco", "muestra", "strame"]
    ):
        return IntentResult(intent="SEARCH_PRODUCTS", confidence=0.86, explanation="Product search detected.")
    if any(word in normalized for word in ["talla", "color", "variant", "variante", "size "]) and "agrega" not in normalized:
        return IntentResult(intent="CHECK_VARIANT_AVAILABILITY", confidence=0.88, explanation="Variant availability request detected.")
    if any(word in normalized for word in ["paga", "pagar", "checkout", "compra todo", "pay"]):
        return IntentResult(intent="CHECKOUT_REQUEST", confidence=0.93, explanation="Checkout request detected.")
    if any(word in normalized for word in ["vacia", "vaciar", "elimina todo", "clear cart", "confirmar vaciar carrito"]):
        return IntentResult(intent="CLEAR_CART", confidence=0.93, explanation="Clear cart detected.")
    if any(word in normalized for word in ["cambia la cantidad", "actualiza", "update that item", "update quantity"]):
        return IntentResult(intent="UPDATE_CART_ITEM", confidence=0.91, explanation="Update cart item detected.")
    if any(word in normalized for word in ["quita", "elimina", "remove"]):
        return IntentResult(intent="REMOVE_FROM_CART", confidence=0.91, explanation="Remove from cart detected.")
    if any(word in normalized for word in ["que tengo", "quÃ© tengo", "ver carrito", "mi carrito", "what is in my cart"]):
        return IntentResult(intent="GET_CART", confidence=0.90, explanation="Cart read detected.")
    if any(word in normalized for word in ["agrega", "anade", "add to cart", "add ", "carrito"]):
        return IntentResult(intent="ADD_TO_CART", confidence=0.92, explanation="Add to cart detected.")
    if any(word in normalized for word in ["compara", "compare", "diferencias", "cheaper", "contrasta", "conviene mas"]):
        return IntentResult(intent="COMPARE_PRODUCTS", confidence=0.86, explanation="Comparison detected.")
    if any(word in normalized for word in ["detalle", "details", "este producto", "incluye", "precio real", "rating", "specifications", "descripcion resumida", "available", "stock"]):
        return IntentResult(intent="GET_PRODUCT_DETAILS", confidence=0.80, explanation="Product detail detected.")
    if any(
        word in normalized
        for word in [
            "busco",
            "busca",
            "muestra",
            "muestrame",
            "strame",
            "quiero",
            "find",
            "recomienda",
            "recomiendame",
            "recomiendas",
            "sugiere",
            "recommend",
            "search",
            "show",
            "necesito ver",
            "necesito una recomendacion",
            "dame una recomendacion",
        ]
    ):
        intent = "RECOMMEND_PRODUCTS" if any(word in normalized for word in ["recomienda", "recomiendame", "recomiendas", "recommend", "regalo", "sugiere", "recomendacion"]) else "SEARCH_PRODUCTS"
        return IntentResult(intent=intent, confidence=0.84, explanation="Product discovery detected.")
    return IntentResult(intent="GENERAL_STORE_QUESTION", confidence=0.76, explanation="General store question.")


def extract_constraints_heuristic(
    message: str,
    max_products: int,
    client_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    client_context = client_context or {}
    lowered = normalize_text(message)

    max_price = None
    max_match = MAX_PRICE_RE.search(message)
    if max_match:
        max_price = max_match.group(1).replace(",", ".")
    min_price = None
    min_match = MIN_PRICE_RE.search(message)
    if min_match:
        min_price = min_match.group(1).replace(",", ".")

    size_match = SIZE_RE.search(message)
    requested_size = size_match.group(1).lower() if size_match else None
    requested_colors = sorted({color for word, color in COLOR_ALIASES.items() if re.search(rf"\b{word}\b", lowered)})

    category = next((slug for word, slug in CATEGORY_ALIASES.items() if re.search(rf"\b{word}\b", lowered)), None)
    if not category and any(word in lowered for word in ["similar", "similares", "alternativa", "alternativas"]):
        category = sanitize_constraint(client_context.get("current_category"))

    brand_match = BRAND_RE.search(message)
    brands = None
    if brand_match:
        brand = sanitize_constraint(brand_match.group(1).split()[0])
        brands = [brand] if brand else None

    sort_by = "relevance"
    if any(phrase in lowered for phrase in ["mas barato", "menor precio", "cheapest", "lowest price"]):
        sort_by = "price_asc"
    elif any(phrase in lowered for phrase in ["mas caro", "mayor precio", "most expensive", "highest price"]):
        sort_by = "price_desc"
    elif any(phrase in lowered for phrase in ["mejor calificado", "rating", "best rated"]):
        sort_by = "rating"
    elif any(phrase in lowered for phrase in ["nuevo", "nuevos", "newest", "new arrivals"]):
        sort_by = "newest"

    limit_match = LIMIT_RE.search(message)
    leading_limit = re.search(r"\b(?:muestra|show|ver|dame)\s+(\d{1,2})\b", message, re.IGNORECASE)
    requested_limit = int(limit_match.group(1)) if limit_match else int(leading_limit.group(1)) if leading_limit else max_products
    limit = max(1, min(max_products, requested_limit))

    words = re.sub(r"[^\w\s-]", " ", lowered).split()
    stop = {
        "busco",
        "busca",
        "muestra",
        "muestrame",
        "recomienda",
        "agrega",
        "anade",
        "carrito",
        "producto",
        "productos",
        "opciones",
        "items",
        "results",
        "menos",
        "hasta",
        "desde",
        "dolares",
        "usd",
        "de",
        "que",
        "por",
        "favor",
        "similar",
        "similares",
        "alternativa",
        "alternativas",
        "marca",
        "brand",
        "barato",
        "baratos",
        "caro",
        "caros",
        "nuevo",
        "nuevos",
        "precio",
        "menor",
        "mayor",
        "mas",
    }
    ignored = set(CATEGORY_ALIASES.keys())
    query_words = [word for word in words if word not in stop and word not in ignored and not word.isdigit()]

    quantity_match = next(
        (
            candidate
            for candidate in QUANTITY_RE.finditer(message)
            if not size_match or not (size_match.start(1) <= candidate.start(1) < size_match.end(1))
        ),
        None,
    )
    quantity = int(quantity_match.group(1)) if quantity_match else 1
    if not quantity_match:
        quantity = next((value for word, value in QUANTITY_WORDS.items() if re.search(rf"\b{word}\b", lowered)), 1)

    referenced_position = next(
        (position for word, position in REFERENCE_POSITIONS.items() if re.search(rf"\b(?:el|la|the)?\s*{word}\b", lowered)),
        None,
    )
    if referenced_position is None and re.search(r"\b(ese|esa|that one|that)\b", lowered):
        referenced_position = 1

    return {
        "query": " ".join(query_words[:6]) or None,
        "category": category,
        "min_price": min_price,
        "max_price": max_price,
        "colors": requested_colors or None,
        "sizes": [requested_size] if requested_size else None,
        "brands": brands,
        "referenced_position": referenced_position,
        "sort_by": sort_by,
        "limit": limit,
        "in_stock_only": True,
        "quantity": max(1, min(25, quantity)),
    }


def sanitize_constraint(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"[^a-z0-9_-]", "", str(value).lower().strip())
    return cleaned or None


def normalize_text(value: str) -> str:
    lowered = value.lower()
    normalized = unicodedata.normalize("NFKD", lowered)
    return "".join(char for char in normalized if not unicodedata.combining(char))
