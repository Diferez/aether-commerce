import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import {
  buildRestockStatements,
  buildStockDecrementStatements,
  convertCartReservations,
  getAvailableStock,
  getReservationTtlMinutes,
  releaseReservation,
  upsertActiveReservation
} from "./inventory";

type QueuedResponse = { first?: unknown; all?: unknown[] };

function fakeEnv(responses: QueuedResponse[] = []) {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  let callIndex = 0;
  const db = {
    prepare: vi.fn((sql: string) => {
      const response = responses[callIndex] ?? {};
      callIndex += 1;
      // Real D1 (and some existing code in this repo, e.g. admin.ts's
      // GET /coupons) allows calling .first()/.all()/.run() straight off
      // .prepare() when there's nothing to bind - not every statement goes
      // through .bind() first, so both paths need to work here too.
      const bound = {
        sql,
        args: [] as unknown[],
        first: vi.fn(() => Promise.resolve(response.first ?? null)),
        all: vi.fn(() => Promise.resolve({ results: response.all ?? [] })),
        run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }))
      };
      return {
        ...bound,
        bind: vi.fn((...args: unknown[]) => {
          statements.push({ sql, args });
          return {
            sql,
            args,
            first: vi.fn(() => Promise.resolve(response.first ?? null)),
            all: vi.fn(() => Promise.resolve({ results: response.all ?? [] })),
            run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }))
          };
        })
      };
    }),
    batch: vi.fn((stmts: unknown[]) => Promise.resolve(stmts.map(() => ({ success: true }))))
  };
  return { env: { DB: db } as unknown as Env, db, statements };
}

describe("getAvailableStock", () => {
  it("returns null when the product doesn't exist", async () => {
    const { env } = fakeEnv([{ first: null }]);
    expect(await getAvailableStock(env, "prd_missing")).toBeNull();
  });

  it("subtracts active reservations from other carts, floored at zero", async () => {
    const { env } = fakeEnv([{ first: { stock: 5 } }, { first: { qty: 3 } }]);
    const result = await getAvailableStock(env, "prd_1", "cart_a");
    expect(result).toEqual({ stock: 5, reservedByOthers: 3, available: 2 });
  });

  it("floors available at zero when reservations exceed stock", async () => {
    const { env } = fakeEnv([{ first: { stock: 2 } }, { first: { qty: 9 } }]);
    const result = await getAvailableStock(env, "prd_1");
    expect(result?.available).toBe(0);
  });

  it("excludes this cart's own reservation from the reserved-by-others sum", async () => {
    const { env, statements } = fakeEnv([{ first: { stock: 5 } }, { first: { qty: 0 } }]);
    await getAvailableStock(env, "prd_1", "cart_a");
    expect(statements[1]?.args).toContain("cart_a");
  });
});

describe("getReservationTtlMinutes", () => {
  it("falls back to the default when no override has been saved", async () => {
    const { env } = fakeEnv([{ first: null }]);
    expect(await getReservationTtlMinutes(env)).toBe(15);
  });

  it("returns the admin-configured override when present", async () => {
    const { env } = fakeEnv([{ first: { value_json: JSON.stringify({ ttlMinutes: 30 }) } }]);
    expect(await getReservationTtlMinutes(env)).toBe(30);
  });

  it("falls back to the default when the stored value is malformed", async () => {
    const { env } = fakeEnv([{ first: { value_json: "not json" } }]);
    expect(await getReservationTtlMinutes(env)).toBe(15);
  });

  it("falls back to the default when ttlMinutes is not a positive number", async () => {
    const { env } = fakeEnv([{ first: { value_json: JSON.stringify({ ttlMinutes: 0 }) } }]);
    expect(await getReservationTtlMinutes(env)).toBe(15);
  });
});

describe("upsertActiveReservation", () => {
  it("inserts a new reservation when none exists for this cart+product", async () => {
    // response[0] is the reservations TTL setting lookup (no row -> default), response[1] is the existing-reservation check
    const { env, db } = fakeEnv([{ first: null }, { first: null }]);
    await upsertActiveReservation(env, { cartId: "cart_a", productId: "prd_1", sku: "SKU-1", quantity: 2 });
    expect(db.prepare).toHaveBeenCalledTimes(3);
    const insertCall = (db.prepare as ReturnType<typeof vi.fn>).mock.calls[2]![0] as string;
    expect(insertCall).toContain("insert into inventory_reservations");
  });

  it("updates the existing active reservation instead of inserting a duplicate", async () => {
    const { env, db } = fakeEnv([{ first: null }, { first: { id: "res_1" } }]);
    await upsertActiveReservation(env, { cartId: "cart_a", productId: "prd_1", sku: "SKU-1", quantity: 4 });
    const updateCall = (db.prepare as ReturnType<typeof vi.fn>).mock.calls[2]![0] as string;
    expect(updateCall).toContain("update inventory_reservations set quantity");
  });
});

describe("releaseReservation", () => {
  it("marks the active reservation released", async () => {
    const { env, statements } = fakeEnv();
    await releaseReservation(env, "cart_a", "prd_1");
    expect(statements[0]?.sql).toContain("status = 'released'");
    expect(statements[0]?.args).toEqual(["cart_a", "prd_1"]);
  });
});

describe("convertCartReservations", () => {
  it("builds a statement to convert this cart's active reservations, without executing it", () => {
    const { env, db } = fakeEnv();
    const statement = convertCartReservations(env, "cart_a") as unknown as { sql: string };
    expect(statement.sql).toContain("status = 'converted'");
    expect(db.batch).not.toHaveBeenCalled();
  });
});

describe("buildStockDecrementStatements", () => {
  it("builds a stock decrement and a sale movement per item", () => {
    const { env } = fakeEnv();
    const statements = buildStockDecrementStatements(
      env,
      [
        { productId: "prd_1", sku: "SKU-1", quantity: 2 },
        { productId: "prd_2", sku: "SKU-2", quantity: 1 }
      ],
      { actorId: "stripe", requestId: "req_1" }
    );
    const typed = statements as unknown as Array<{ sql: string; args: unknown[] }>;
    expect(typed).toHaveLength(4);
    expect(typed[0]!.sql).toContain("max(0, stock - ?)");
    expect(typed[1]!.sql).toContain("type, quantity");
    expect(typed[1]!.sql).toContain("'sale'");
  });

  it("binds a real ISO string for updated_at, never inline CURRENT_TIMESTAMP", () => {
    const { env } = fakeEnv();
    const statements = buildStockDecrementStatements(env, [{ productId: "prd_1", sku: "SKU-1", quantity: 1 }], {
      actorId: "stripe",
      requestId: "req_1"
    });
    const typed = statements as unknown as Array<{ sql: string; args: unknown[] }>;
    expect(typed[0]!.sql).not.toContain("CURRENT_TIMESTAMP");
    const updatedAt = typed[0]!.args[1] as string;
    expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("buildRestockStatements", () => {
  it("reads order_items and builds a matching stock increment + return movement per item", async () => {
    const { env } = fakeEnv([
      {
        all: [
          { product_id: "prd_1", sku: "SKU-1", payload_json: JSON.stringify({ quantity: 3 }) },
          { product_id: "prd_2", sku: "SKU-2", payload_json: JSON.stringify({ quantity: 1 }) }
        ]
      }
    ]);
    const statements = await buildRestockStatements(env, "ord_1", { actorId: "usr_admin", requestId: "req_1", reason: "refund" });
    const typed = statements as unknown as Array<{ sql: string; args: unknown[] }>;
    expect(typed).toHaveLength(4);
    expect(typed[0]!.sql).toContain("stock = stock + ?");
    expect(typed[0]!.sql).not.toContain("CURRENT_TIMESTAMP");
    const updatedAt = typed[0]!.args[1] as string;
    expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(typed[1]!.sql).toContain("'return'");
  });

  it("skips line items with a zero or missing quantity", async () => {
    const { env } = fakeEnv([
      { all: [{ product_id: "prd_1", sku: "SKU-1", payload_json: JSON.stringify({}) }] }
    ]);
    const statements = await buildRestockStatements(env, "ord_1", { actorId: "usr_admin", requestId: "req_1", reason: "refund" });
    expect(statements).toHaveLength(0);
  });
});
