import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { materializeClientMigrations } from "../scripts/export-core-migrations.mjs";

test("client migration export excludes Aether demo records", () => {
  const root = mkdtempSync(join(tmpdir(), "aether-client-migrations-"));
  const destination = join(root, "migrations");
  try {
    materializeClientMigrations(destination);
    const files = readdirSync(destination).filter((file) => file.endsWith(".sql"));
    assert.deepEqual(files, ["0001_initial.sql", "0003_required_commerce_schema.sql", "0005_ai_assistant.sql", "0006_ai_rate_limits.sql"]);
    const content = files.map((file) => readFileSync(join(destination, file), "utf8")).join("\n");
    assert.doesNotMatch(content, /AETHER10|portafolio-aether|Demo Customer|demo_admin_notice/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
