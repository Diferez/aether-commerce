/** Stable request data an adapter must forward for state-changing cart tools. */
export type AgentCartToolRequest = {
  cartId: string;
  cartToken: string;
  idempotencyKey: string;
};

/**
 * Transport-neutral cart operations. A client adapter may use HTTP, RPC or a
 * direct application service without exposing its implementation to the agent.
 */
export interface AgentCartToolGateway<Cart, Product> {
  add(input: AgentCartToolRequest & { product: Product; quantity: number }): Promise<Cart | null>;
  remove(input: AgentCartToolRequest & { itemId: string }): Promise<Cart | null>;
  update(input: AgentCartToolRequest & { itemId: string; quantity: number }): Promise<Cart | null>;
}

/**
 * Executes cart tool requests through a client-owned gateway. It deliberately
 * preserves transport errors and null outcomes so each runtime can retain its
 * existing response and audit policy.
 */
export class AgentCartToolExecutor<Cart, Product, Item = unknown> {
  constructor(private readonly gateway: AgentCartToolGateway<Cart, Product>) {}

  add(input: AgentCartToolRequest & { product: Product; quantity: number }): Promise<Cart | null> {
    return this.gateway.add(input);
  }

  remove(input: AgentCartToolRequest & { itemId: string }): Promise<Cart | null> {
    return this.gateway.remove(input);
  }

  update(input: AgentCartToolRequest & { itemId: string; quantity: number }): Promise<Cart | null> {
    return this.gateway.update(input);
  }

  async clear(input: AgentCartToolRequest & {
    cart: Cart;
    items: readonly Item[];
    getItemId(item: Item): string;
  }): Promise<Cart | null> {
    let latest: Cart | null = input.cart;
    for (const item of input.items) {
      const itemId = input.getItemId(item);
      if (itemId) {
        latest = await this.remove({
          cartId: input.cartId,
          cartToken: input.cartToken,
          idempotencyKey: input.idempotencyKey,
          itemId
        });
      }
    }
    return latest;
  }
}
