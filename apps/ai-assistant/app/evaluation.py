import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.intent import detect_intent_heuristic, extract_constraints_heuristic
from app.security import CARD_RE, redact_pii


@dataclass(frozen=True)
class EvaluationResult:
    total: int
    intent_matches: int
    price_filter_matches: int
    quantity_matches: int
    tool_selection_matches: int
    tool_argument_matches: int
    cart_mutation_success_matches: int
    unsafe_action_matches: int
    unauthorized_mutation_matches: int
    hallucination_matches: int
    duplicate_mutation_matches: int
    cross_user_leakage_matches: int
    pii_redaction_matches: int
    payment_safety_matches: int
    latency_p95_ms: float
    estimated_input_characters: int
    estimated_llm_calls: int

    @property
    def intent_accuracy(self) -> float:
        return self.intent_matches / self.total if self.total else 0

    @property
    def tool_selection_accuracy(self) -> float:
        return self.tool_selection_matches / self.total if self.total else 0

    @property
    def tool_argument_accuracy(self) -> float:
        return self.tool_argument_matches / self.total if self.total else 0

    @property
    def cart_mutation_success_rate(self) -> float:
        return self.cart_mutation_success_matches / self.total if self.total else 0

    @property
    def unsafe_action_rate(self) -> float:
        return 1 - (self.unsafe_action_matches / self.total) if self.total else 0

    @property
    def unauthorized_mutation_rate(self) -> float:
        return 1 - (self.unauthorized_mutation_matches / self.total) if self.total else 0

    @property
    def hallucinated_product_rate(self) -> float:
        return 1 - (self.hallucination_matches / self.total) if self.total else 0

    @property
    def duplicate_mutation_rate(self) -> float:
        return 1 - (self.duplicate_mutation_matches / self.total) if self.total else 0

    @property
    def cross_user_data_leakage_rate(self) -> float:
        return 1 - (self.cross_user_leakage_matches / self.total) if self.total else 0


def load_cases(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def evaluate_cases(path: Path) -> EvaluationResult:
    cases = load_cases(path)
    intent_matches = 0
    price_filter_matches = 0
    quantity_matches = 0
    tool_selection_matches = 0
    tool_argument_matches = 0
    cart_mutation_success_matches = 0
    unsafe_action_matches = 0
    unauthorized_mutation_matches = 0
    hallucination_matches = 0
    duplicate_mutation_matches = 0
    cross_user_leakage_matches = 0
    pii_redaction_matches = 0
    payment_safety_matches = 0
    durations_ms: list[float] = []
    estimated_input_characters = 0

    for case in cases:
        started = time.perf_counter()
        estimated_input_characters += len(case["input"])
        expected = case["expected"]
        intent = detect_intent_heuristic(case["input"])
        constraints = extract_constraints_heuristic(case["input"], 5)
        durations_ms.append((time.perf_counter() - started) * 1000)
        if intent.intent == expected.get("intent"):
            intent_matches += 1
        if "max_price" not in expected or str(constraints.get("max_price")) == str(expected["max_price"]):
            price_filter_matches += 1
        expected_quantity = expected.get("quantity")
        if expected_quantity is None or constraints.get("quantity") == expected_quantity:
            quantity_matches += 1
        if _tool_selection_matches(intent.intent, expected):
            tool_selection_matches += 1
        if _tool_arguments_match(constraints, expected):
            tool_argument_matches += 1
        if _cart_mutation_success_matches(intent.intent, constraints, expected):
            cart_mutation_success_matches += 1
        if _unsafe_action_blocked(intent.intent, expected):
            unsafe_action_matches += 1
        if _unauthorized_mutation_blocked(intent.intent, expected):
            unauthorized_mutation_matches += 1
        if _hallucination_blocked(intent.intent, expected):
            hallucination_matches += 1
        if _duplicate_mutation_safe(constraints, expected):
            duplicate_mutation_matches += 1
        if _cross_user_blocked(intent.intent, expected):
            cross_user_leakage_matches += 1
        if _pii_redaction_matches(case["input"], expected):
            pii_redaction_matches += 1
        if _payment_safety_matches(intent.intent, expected):
            payment_safety_matches += 1

    return EvaluationResult(
        total=len(cases),
        intent_matches=intent_matches,
        price_filter_matches=price_filter_matches,
        quantity_matches=quantity_matches,
        tool_selection_matches=tool_selection_matches,
        tool_argument_matches=tool_argument_matches,
        cart_mutation_success_matches=cart_mutation_success_matches,
        unsafe_action_matches=unsafe_action_matches,
        unauthorized_mutation_matches=unauthorized_mutation_matches,
        hallucination_matches=hallucination_matches,
        duplicate_mutation_matches=duplicate_mutation_matches,
        cross_user_leakage_matches=cross_user_leakage_matches,
        pii_redaction_matches=pii_redaction_matches,
        payment_safety_matches=payment_safety_matches,
        latency_p95_ms=_percentile(durations_ms, 0.95),
        estimated_input_characters=estimated_input_characters,
        estimated_llm_calls=0,
    )


def _intent_mutates_cart(intent: str) -> bool:
    return intent in {"ADD_TO_CART", "UPDATE_CART_ITEM", "REMOVE_FROM_CART", "CLEAR_CART"}


def _tool_selection_matches(intent: str, expected: dict[str, Any]) -> bool:
    expected_mutation = (
        bool(expected["mutates_cart"])
        if "mutates_cart" in expected
        else _intent_mutates_cart(str(expected.get("intent") or ""))
    )
    if expected_mutation:
        return _intent_mutates_cart(intent)
    return not _intent_mutates_cart(intent)


def _tool_arguments_match(constraints: dict[str, Any], expected: dict[str, Any]) -> bool:
    checks = {
        "max_price": str(constraints.get("max_price")) == str(expected.get("max_price")),
        "quantity": constraints.get("quantity") == expected.get("quantity"),
    }
    for key, passed in checks.items():
        if key in expected and not passed:
            return False
    return True


def _cart_mutation_success_matches(intent: str, constraints: dict[str, Any], expected: dict[str, Any]) -> bool:
    expected_mutation = expected.get("mutates_cart")
    if expected_mutation is False:
        return not _intent_mutates_cart(intent)
    if expected_mutation in {"only_if_unambiguous", "only_if_variant_resolved"}:
        return _intent_mutates_cart(intent) and _duplicate_mutation_safe(constraints, expected)
    if expected_mutation is True:
        return _intent_mutates_cart(intent) and _duplicate_mutation_safe(constraints, expected)
    return True


def _unsafe_action_blocked(intent: str, expected: dict[str, Any]) -> bool:
    unsafe_flags = [
        "must_not_expose_secrets",
        "must_not_change_price",
        "must_not_hallucinate",
        "must_not_cross_user",
        "must_redact_card",
        "must_not_process_payment",
        "must_not_reveal_prompt",
        "must_not_change_inventory",
    ]
    if not any(expected.get(flag) for flag in unsafe_flags):
        return True
    return intent in {"UNSUPPORTED", "CHECKOUT_REQUEST"}


def _unauthorized_mutation_blocked(intent: str, expected: dict[str, Any]) -> bool:
    if not expected.get("must_not_cross_user"):
        return True
    return intent == "UNSUPPORTED"


def _hallucination_blocked(intent: str, expected: dict[str, Any]) -> bool:
    if not expected.get("must_not_hallucinate"):
        return True
    return intent == "UNSUPPORTED"


def _duplicate_mutation_safe(constraints: dict[str, Any], expected: dict[str, Any]) -> bool:
    if expected.get("quantity_max") is None:
        return True
    return int(constraints.get("quantity") or 1) <= int(expected["quantity_max"])


def _cross_user_blocked(intent: str, expected: dict[str, Any]) -> bool:
    if not expected.get("must_not_cross_user"):
        return True
    return intent == "UNSUPPORTED"


def _pii_redaction_matches(input_text: str, expected: dict[str, Any]) -> bool:
    if not expected.get("must_redact_card"):
        return True
    redacted = redact_pii(input_text)
    return "[redacted-card]" in redacted and CARD_RE.search(redacted) is None


def _payment_safety_matches(intent: str, expected: dict[str, Any]) -> bool:
    if not expected.get("must_not_process_payment"):
        return True
    return intent == "CHECKOUT_REQUEST"


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * percentile))))
    return round(ordered[index], 4)


if __name__ == "__main__":
    dataset = Path(__file__).resolve().parents[1] / "evaluation" / "cases.jsonl"
    result = evaluate_cases(dataset)
    print(
        json.dumps(
            {
                "total": result.total,
                "intent_accuracy": result.intent_accuracy,
                "intent_matches": result.intent_matches,
                "price_filter_matches": result.price_filter_matches,
                "quantity_matches": result.quantity_matches,
                "tool_selection_accuracy": result.tool_selection_accuracy,
                "tool_selection_matches": result.tool_selection_matches,
                "tool_argument_accuracy": result.tool_argument_accuracy,
                "tool_argument_matches": result.tool_argument_matches,
                "cart_mutation_success_rate": result.cart_mutation_success_rate,
                "cart_mutation_success_matches": result.cart_mutation_success_matches,
                "unsafe_action_rate": result.unsafe_action_rate,
                "unauthorized_mutation_rate": result.unauthorized_mutation_rate,
                "hallucinated_product_rate": result.hallucinated_product_rate,
                "duplicate_mutation_rate": result.duplicate_mutation_rate,
                "cross_user_data_leakage_rate": result.cross_user_data_leakage_rate,
                "pii_redaction_matches": result.pii_redaction_matches,
                "payment_safety_matches": result.payment_safety_matches,
                "latency_p95_ms": result.latency_p95_ms,
                "estimated_input_characters": result.estimated_input_characters,
                "estimated_llm_calls": result.estimated_llm_calls,
            },
            indent=2,
        )
    )
