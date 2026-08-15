import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cart } from "@aether/schemas";
import type { Env } from "../types";
import { createManualOrder, createOrderFromStripeSession } from "./orders";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("./catalog", () => ({
  getProductById: vi.fn(),
  clearCatalogCache: vi.fn()
}));

vi.mock("./cart", () => ({
  readCart: vi.fn()
}));

vi.mock("./inventory", () => ({
  getAvailableStock: vi.fn(),
  buildStockDecrementStatements: vi.fn(() => []),
  convertCartReservations: vi.fn(() => ({ __mockStatement: "convert" }))
}));

type QueuedResponse = { first?: unknown; all?: unknown[] };

function fakeEnv(responses: QueuedResponse[] = []) {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  let callIndex = 0;
  const db = {
    prepare: vi.fn((sql: string) => {
      const response = responses[callIndex] ?? {};
      callIndex += 1;
      return {
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

function fakeCart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart_1",
    items: [
      {
        productId: "prd_1",
        quantity: 2,
        name: "Funda Slim Grip",
        slug: "funda-slim-grip",
        imageUrl: "https://store.example/funda.webp",
        unitPrice: 1900,
        finalUnitPrice: 1900,
        lineTotal: 3800,
        currency: "USD"
      }
    ],
    totals: { subtotal: 3800, discount: 0, shipping: 0, tax: 0, total: 3800, currency: "USD" },
    updatedAt: new Date().toISOString(),
    ...overrides
  };
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

  it("returns insufficient_stock when requested quantity exceeds what's available", async () => {
    const { getProductById } = await import("./catalog");
    const { getAvailableStock } = await import("./inventory");
    vi.mocked(getProductById).mockResolvedValueOnce({
      id: "prd_0001",
      sku: "SKU-1",
      slug: "funda-slim-grip",
      name: "Funda Slim Grip",
      thumbnail: "",
      finalPrice: 1900
    } as never);
    vi.mocked(getAvailableStock).mockResolvedValueOnce({ stock: 2, reservedByOthers: 1, available: 1 });

    const { env, db } = fakeEnv();
    const result = await createManualOrder(env, {
      email: "buyer@example.com",
      items: [{ productId: "prd_0001", quantity: 5 }],
      actorId: "usr_admin",
      requestId: "req_1"
    });
    expect(result).toEqual({ error: "insufficient_stock" });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("prices line items from the real catalog product, not admin-supplied amounts, and rounds/clamps quantity", async () => {
    const { getProductById } = await import("./catalog");
    vi.mocked(getProductById).mockResolvedValueOnce({
      id: "prd_0001",
      sku: "SKU-1",
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
    // (buildStockDecrementStatements is mocked to return [], so it adds nothing here)
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
      .mockResolvedValueOnce({ id: "prd_a", sku: "SKU-A", slug: "a", name: "A", thumbnail: "", finalPrice: 1000 } as never)
      .mockResolvedValueOnce({ id: "prd_b", sku: "SKU-B", slug: "b", name: "B", thumbnail: "", finalPrice: 2500 } as never);

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

  it("decrements stock for every line item via buildStockDecrementStatements", async () => {
    const { getProductById } = await import("./catalog");
    const { buildStockDecrementStatements } = await import("./inventory");
    vi.mocked(getProductById).mockResolvedValueOnce({
      id: "prd_0001",
      sku: "SKU-1",
      slug: "funda-slim-grip",
      name: "Funda Slim Grip",
      thumbnail: "",
      finalPrice: 1900
    } as never);

    const { env } = fakeEnv();
    await createManualOrder(env, {
      email: "buyer@example.com",
      items: [{ productId: "prd_0001", quantity: 2 }],
      actorId: "usr_admin",
      requestId: "req_1"
    });

    expect(buildStockDecrementStatements).toHaveBeenCalledWith(
      env,
      [{ productId: "prd_0001", sku: "SKU-1", quantity: 2 }],
      expect.objectContaining({ actorId: "usr_admin", requestId: "req_1" })
    );
  });
});

describe("createOrderFromStripeSession", () => {
  it("short-circuits on an existing order without decrementing stock again (idempotency)", async () => {
    const { readCart } = await import("./cart");
    const { buildStockDecrementStatements } = await import("./inventory");
    vi.mocked(readCart).mockResolvedValueOnce(fakeCart());

    const { env, db } = fakeEnv([{ first: { payload_json: JSON.stringify({ id: "ord_cs_1" }) } }]);
    const result = await createOrderFromStripeSession(env, { id: "cs_1", payment_status: "paid", metadata: { cartId: "cart_1" } });

    expect(result.created).toBe(false);
    expect(db.batch).not.toHaveBeenCalled();
    expect(buildStockDecrementStatements).not.toHaveBeenCalled();
  });

  it("decrements stock, converts reservations, and clears the catalog cache on real creation", async () => {
    const { readCart } = await import("./cart");
    const { clearCatalogCache } = await import("./catalog");
    const { buildStockDecrementStatements, convertCartReservations } = await import("./inventory");
    vi.mocked(readCart).mockResolvedValueOnce(fakeCart());

    const { env } = fakeEnv([{ first: null }, { all: [{ id: "prd_1", sku: "SKU-1" }] }]);
    const result = await createOrderFromStripeSession(env, {
      id: "cs_1",
      payment_status: "paid",
      metadata: { cartId: "cart_1" }
    });

    expect(result.created).toBe(true);
    expect(buildStockDecrementStatements).toHaveBeenCalledWith(
      env,
      [{ productId: "prd_1", sku: "SKU-1", quantity: 2 }],
      expect.objectContaining({ actorId: "stripe" })
    );
    expect(convertCartReservations).toHaveBeenCalledWith(env, "cart_1");
    expect(clearCatalogCache).toHaveBeenCalledWith(env);
  });

  it("skips stock/movement bookkeeping for a cart item whose product was deleted, without failing order creation", async () => {
    const { readCart } = await import("./cart");
    const { buildStockDecrementStatements } = await import("./inventory");
    vi.mocked(readCart).mockResolvedValueOnce(fakeCart());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // sku lookup returns zero rows - the cart's one product is "missing"
    const { env } = fakeEnv([{ first: null }, { all: [] }]);
    const result = await createOrderFromStripeSession(env, {
      id: "cs_1",
      payment_status: "paid",
      metadata: { cartId: "cart_1" }
    });

    expect(result.created).toBe(true);
    expect(buildStockDecrementStatements).toHaveBeenCalledWith(env, [], expect.any(Object));
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
