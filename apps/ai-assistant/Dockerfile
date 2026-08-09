FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements-docker.txt .
RUN python -m venv /opt/aether-venv \
  && /opt/aether-venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/aether-venv/bin/pip install --no-cache-dir -r requirements-docker.txt

FROM python:3.12-slim AS runtime

ENV PATH="/opt/aether-venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN addgroup --system aether && adduser --system --ingroup aether aether

COPY --from=builder /opt/aether-venv /opt/aether-venv

COPY app ./app
COPY migrations ./migrations

USER aether

EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/healthz', timeout=3)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
