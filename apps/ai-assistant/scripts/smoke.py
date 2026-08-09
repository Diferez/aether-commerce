import json
import os
import sys
import time
import urllib.request


def get_json(base_url: str, path: str) -> dict:
    with urllib.request.urlopen(f"{base_url.rstrip('/')}{path}", timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def get_text(base_url: str, path: str) -> str:
    with urllib.request.urlopen(f"{base_url.rstrip('/')}{path}", timeout=10) as response:
        return response.read().decode("utf-8")


def main() -> None:
    base_url = os.environ.get("AETHER_AI_URL", "http://127.0.0.1:8090")
    last_error: Exception | None = None
    for _ in range(20):
        try:
            health = get_json(base_url, "/healthz")
            ready = get_json(base_url, "/readyz")
            break
        except Exception as exc:
            last_error = exc
            time.sleep(1)
    else:
        raise RuntimeError(f"assistant did not become healthy: {last_error}")

    if health.get("status") != "ok":
        raise SystemExit("healthz failed")
    if ready.get("status") not in {"ready", "disabled"}:
        raise SystemExit("readyz failed")
    metrics = get_text(base_url, "/metrics")
    if "ai_requests_total" not in metrics:
        raise SystemExit("metrics failed")
    print(json.dumps({"health": health, "ready": ready, "metrics": "ok"}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"smoke_failed: {exc}", file=sys.stderr)
        raise
