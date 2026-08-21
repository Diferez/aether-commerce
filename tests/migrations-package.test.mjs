import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { syncMigrations } from "../packages/migrations/bin/aether-migrations.mjs";

test("published migration sync adds missing files and protects immutable history", () => {
  const root = mkdtempSync(join(tmpdir(), "aether-published-migrations-"));
  try {
    const first = syncMigrations(root);
    assert.equal(first.added.at(-1), "0023_low_stock_alerts.sql");
    assert.match(readFileSync(join(root, "0022_restock_notifications.sql"), "utf8"), /restock_notifications/i);
    assert.deepEqual(syncMigrations(root).added, []);

    writeFileSync(join(root, "0001_initial.sql"), "-- modified after publication\n");
    assert.throws(() => syncMigrations(root), /differs from Aether's immutable source/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
