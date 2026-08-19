import { describe, expect, it } from "vitest";
import { AgentCartToolExecutor, type AgentCartToolGateway } from "./tools";

type Cart = { revision: number };
type CartItem = { id: string };

describe("agent cart tool execution", () => {
  it("forwards mutations to the client-owned gateway with idempotency data", async () => {
    const calls: unknown[] = [];
    const gateway: AgentCartToolGateway<Cart, string> = {
      add: (input) => { calls.push(input); return Promise.resolve({ revision: 1 }); },
      remove: (input) => { calls.push(input); return Promise.resolve({ revision: 2 }); },
      update: (input) => { calls.push(input); return Promise.resolve({ revision: 3 }); }
    };
    const tools = new AgentCartToolExecutor<Cart, string, CartItem>(gateway);
    await tools.add({ cartId: "cart", cartToken: "token", idempotencyKey: "key", product: "sku", quantity: 2 });
    await tools.update({ cartId: "cart", cartToken: "token", idempotencyKey: "key", itemId: "line", quantity: 3 });
    expect(calls).toEqual([
      { cartId: "cart", cartToken: "token", idempotencyKey: "key", product: "sku", quantity: 2 },
      { cartId: "cart", cartToken: "token", idempotencyKey: "key", itemId: "line", quantity: 3 }
    ]);
  });

  it("clears items in order and preserves the last gateway outcome", async () => {
    const removed: string[] = [];
    const gateway: AgentCartToolGateway<Cart, string> = {
      add: () => Promise.resolve(null),
      remove: ({ itemId }) => { removed.push(itemId); return Promise.resolve(itemId === "second" ? null : { revision: 2 }); },
      update: () => Promise.resolve(null)
    };
    const tools = new AgentCartToolExecutor<Cart, string, CartItem>(gateway);
    const result = await tools.clear({
      cartId: "cart", cartToken: "token", idempotencyKey: "key", cart: { revision: 1 },
      items: [{ id: "first" }, { id: "" }, { id: "second" }], getItemId: (item) => item.id
    });
    expect(removed).toEqual(["first", "second"]);
    expect(result).toBeNull();
  });
});
