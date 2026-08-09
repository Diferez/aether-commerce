import os
from pathlib import Path


def run_migrations(database_url: str | None = None, migrations_dir: Path | None = None) -> None:
    url = database_url or os.environ.get("DATABASE_URL", "")
    if not url.startswith(("postgresql://", "postgres://")):
        raise RuntimeError("DATABASE_URL must be a PostgreSQL URL for production migrations.")

    import psycopg

    directory = migrations_dir or Path(__file__).resolve().parents[1] / "migrations"
    files = sorted(directory.glob("*.sql"))
    if not files:
        raise RuntimeError(f"No migrations found in {directory}")

    with psycopg.connect(url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS ai_schema_migrations (
                  version TEXT PRIMARY KEY,
                  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            for file in files:
                version = file.stem
                cursor.execute("SELECT 1 FROM ai_schema_migrations WHERE version = %s", (version,))
                if cursor.fetchone():
                    continue
                cursor.execute(file.read_text(encoding="utf-8"))
                cursor.execute("INSERT INTO ai_schema_migrations (version) VALUES (%s)", (version,))
        connection.commit()


if __name__ == "__main__":
    run_migrations()
