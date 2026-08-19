export type InventoryRecord = Record<string, unknown>;

export type InventoryAdjustmentInput = {
  productId: string;
  sku: string;
  quantity: number;
  reason?: string;
  actorId: string;
  requestId: string;
};

export type InventoryMovement = {
  id: string;
  productId: string;
  sku: string;
  type: "adjustment_positive" | "adjustment_negative";
  quantity: number;
  reason: string | null;
  actorId: string;
  requestId: string;
};

export interface InventoryRepository {
  countLowStock(): Promise<number>;
  listInventory(): Promise<InventoryRecord[]>;
  listMovements(): Promise<InventoryRecord[]>;
  appendMovement(movement: InventoryMovement): Promise<void>;
}

export type InventoryIdFactory = () => string;

/** Normalizes signed user input into an auditable inventory movement. */
export function createInventoryAdjustment(input: InventoryAdjustmentInput, id: string): InventoryMovement {
  return {
    id,
    productId: input.productId,
    sku: input.sku,
    type: input.quantity >= 0 ? "adjustment_positive" : "adjustment_negative",
    quantity: Math.abs(input.quantity),
    reason: input.reason ?? null,
    actorId: input.actorId,
    requestId: input.requestId
  };
}

export class InventoryService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly createId: InventoryIdFactory
  ) {}

  countLowStock(): Promise<number> {
    return this.repository.countLowStock();
  }

  listInventory(): Promise<InventoryRecord[]> {
    return this.repository.listInventory();
  }

  listMovements(): Promise<InventoryRecord[]> {
    return this.repository.listMovements();
  }

  async adjust(input: InventoryAdjustmentInput): Promise<InventoryMovement> {
    const movement = createInventoryAdjustment(input, this.createId());
    await this.repository.appendMovement(movement);
    return movement;
  }
}
