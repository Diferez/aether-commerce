import type { Address, Cart, Order } from "@aether/schemas";

export type CompletedPaymentSession = {
  id: string;
  amountTotal?: number;
  currency?: string;
  email?: string;
  userId?: string;
  paymentIntentId?: string;
};

export type CreatePaidOrderInput = {
  cart: Cart;
  payment: CompletedPaymentSession;
  paymentProvider: string;
  orderNumberPrefix: string;
  shippingAddress: Address;
  now?: string;
};

/** Derives a stable, customer-facing number without coupling it to a payment provider. */
export function createOrderNumber(sessionId: string, prefix: string): string {
  const suffix = sessionId.replace(/^cs_(test|live)_/, "").slice(0, 10).toUpperCase();
  return `${prefix}-${suffix}`;
}

/**
 * Builds the persistent order payload from a confirmed payment. Database writes
 * and provider-specific webhook verification remain adapter responsibilities.
 */
export function createPaidOrder(input: CreatePaidOrderInput): Order {
  const now = input.now ?? new Date().toISOString();
  const amount = input.payment.amountTotal ?? input.cart.totals.total;
  const currency = (input.payment.currency ?? input.cart.totals.currency).toUpperCase();
  return {
    id: `ord_${input.payment.id}`,
    number: createOrderNumber(input.payment.id, input.orderNumberPrefix),
    ...(input.cart.userId || input.payment.userId ? { userId: input.cart.userId ?? input.payment.userId } : {}),
    email: input.payment.email ?? "customer@example.com",
    state: "paid",
    items: input.cart.items,
    totals: { ...input.cart.totals, total: amount, currency },
    shippingAddress: input.shippingAddress,
    payment: {
      provider: input.paymentProvider,
      providerSessionId: input.payment.id,
      ...(input.payment.paymentIntentId ? { providerPaymentIntentId: input.payment.paymentIntentId } : {}),
      status: "paid",
      amount,
      currency
    },
    createdAt: now,
    updatedAt: now
  };
}

/** Clears the payable balances while preserving the cart identity and actor. */
export function clearPaidCart(cart: Cart): Cart {
  return {
    ...cart,
    items: [],
    totals: { ...cart.totals, subtotal: 0, discount: 0, tax: 0, total: 0 }
  };
}

export type OrderStatusUpdate = {
  orderId: string;
  state: string;
  actorId: string;
  reason?: string;
  requestId: string;
};

export type OrderStatusHistoryEntry = OrderStatusUpdate & { id: string };

/** Persistence port for admin order operations, independent of D1 or Hono. */
export interface OrderManagementRepository {
  appendStatusHistory(entry: OrderStatusHistoryEntry): Promise<void>;
  updateOrderState(orderId: string, state: string): Promise<void>;
}

export class OrderManagementService {
  constructor(
    private readonly repository: OrderManagementRepository,
    private readonly createId: () => string
  ) {}

  async updateStatus(input: OrderStatusUpdate): Promise<void> {
    await this.repository.appendStatusHistory({ ...input, id: this.createId() });
    await this.repository.updateOrderState(input.orderId, input.state);
  }
}

export type CustomerOrder = Record<string, unknown>;

/** Read port scoped to the authenticated customer, independent of database implementation. */
export interface CustomerOrderRepository {
  listByUserId(userId: string): Promise<CustomerOrder[]>;
  findByIdForUser(userId: string, orderId: string): Promise<CustomerOrder | null>;
}

export class CustomerOrderService {
  constructor(private readonly repository: CustomerOrderRepository) {}

  list(userId: string): Promise<CustomerOrder[]> {
    return this.repository.listByUserId(userId);
  }

  find(userId: string, orderId: string): Promise<CustomerOrder | null> {
    return this.repository.findByIdForUser(userId, orderId);
  }
}

export type AdminOrderSummary = Record<string, unknown>;
export type AdminOrderDetail = Record<string, unknown>;

export interface AdminOrderReadRepository {
  listRecent(): Promise<AdminOrderSummary[]>;
  findById(orderId: string): Promise<AdminOrderDetail | null>;
}

export class AdminOrderReadService {
  constructor(private readonly repository: AdminOrderReadRepository) {}

  listRecent(): Promise<AdminOrderSummary[]> {
    return this.repository.listRecent();
  }

  find(orderId: string): Promise<AdminOrderDetail | null> {
    return this.repository.findById(orderId);
  }
}
