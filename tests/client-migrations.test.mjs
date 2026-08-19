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
    assert.deepEqual(files, [
      "0001_initial.sql",
      "0003_required_commerce_schema.sql",
      "0005_ai_assistant.sql",
      "0006_ai_rate_limits.sql",
      "0007_contact_privacy.sql",
      "0008_legal_retention.sql",
      "0009_ai_concurrency.sql",
      "0010_ai_graph_checkpoints.sql",
      "0013_products_table.sql",
      "0015_order_channel_status.sql",
      "0017_customers_status.sql",
      "0018_inventory_reservations_and_restock_guard.sql",
      "0019_admin_chat.sql",
      "0020_observability.sql",
      "0021_security_hardening.sql"
    ]);
    const content = files.map((file) => readFileSync(join(destination, file), "utf8")).join("\n");
    assert.doesNotMatch(content, /AETHER10|portafolio-aether|Demo Customer|demo_admin_notice/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
