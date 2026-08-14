import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { createManualOrder } from "./orders";

vi.mock("./catalog", () => ({
  getProductById: vi.fn()
}));

vi.mock("./cart", () => ({
  readCart: vi.fn()
}));

function fakeEnv() {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => {
        statements.push({ sql, args });
        return { sql, args };
      })
    })),
    batch: vi.fn((stmts: unknown[]) => Promise.resolve(stmts.map(() => ({ success: true }))))
  };
  return { env: { DB: db } as unknown as Env, db, statements };
}

describe("createManualOrder", () => {
  it("returns empty_items without touching the database when items is empty", async () => {
    const { env, db } = fakeEnv();
    const result = await createManualOrder(env, { email: "a@example.com", items: [], actorId: "usr_1", requestId: "req_1" });
    expect(result).toEqual({ error: "empty_items" });
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("returns product_not_found when a referenced product does not exist in the catalog", async () => {
    const { getProductById } = await import("./catalog");
    vi.mocked(getProductById).mockResolvedValueOnce(undefined);

    const { env } = fakeEnv();
    const result = await createManualOrder(env, {
      email: "a@example.com",
      items: [{ productId: "prd_missing", quantity: 1 }],
      actorId: "usr_1",
      requestId: "req_1"
    });
    expect(result).toEqual({ error: "product_not_found" });
  });

  it("prices line items from the real catalog product, not admin-supplied amounts, and rounds/clamps quantity", async () => {
    const { getProductById } = await import("./catalog");
    vi.mocked(getProductById).mockResolvedValueOnce({
      id: "prd_0001",
      slug: "funda-slim-grip",
      name: "Funda Slim Grip",
      thumbnail: "https://store.example/funda.webp",
      finalPrice: 1900
    } as never);

    const { env, db, statements } = fakeEnv();
    const result = await createManualOrder(env, {
      email: "buyer@example.com",
      items: [{ productId: "prd_0001", quantity: 2.6 }],
      notes: "Coordinado por WhatsApp",
      actorId: "usr_admin",
      requestId: "req_42"
    });

    expect("order" in result).toBe(true);
    if (!("order" in result)) throw new Error("expected order result");

    expect(result.order.channel).toBe("whatsapp");
    expect(result.order.paymentStatus).toBe("pending");
    expect(result.order.fulfillmentStatus).toBe("unfulfilled");
    expect(result.order.state).toBe("pending_payment");
    expect((result.order.items as Array<{ quantity: number; lineTotal: number }>)[0]).toMatchObject({
      quantity: 3,
      unitPrice: 1900,
      lineTotal: 5700
    });
    expect((result.order.totals as { total: number }).total).toBe(5700);

    // insert into orders, insert into order_status_history, insert into order_items (x1)
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(statements).toHaveLength(3);
    expect(statements[0]?.sql).toContain("insert into orders");
    expect(statements[0]?.args).toContain("Coordinado por WhatsApp");
    expect(statements[1]?.sql).toContain("insert into order_status_history");
    expect(statements[1]?.args).toContain("usr_admin");
    expect(statements[2]?.sql).toContain("insert into order_items");
  });

  it("sums multiple line items into the order subtotal", async () => {
    const { getProductById } = await import("./catalog");
    vi.mocked(getProductById)
      .mockResolvedValueOnce({ id: "prd_a", slug: "a", name: "A", thumbnail: "", finalPrice: 1000 } as never)
      .mockResolvedValueOnce({ id: "prd_b", slug: "b", name: "B", thumbnail: "", finalPrice: 2500 } as never);

    const { env } = fakeEnv();
    const result = await createManualOrder(env, {
      email: "buyer@example.com",
      items: [
        { productId: "prd_a", quantity: 1 },
        { productId: "prd_b", quantity: 2 }
      ],
      actorId: "usr_admin",
      requestId: "req_43"
    });

    if (!("order" in result)) throw new Error("expected order result");
    expect((result.order.totals as { subtotal: number }).subtotal).toBe(1000 + 2500 * 2);
  });
});
