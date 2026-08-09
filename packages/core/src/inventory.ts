export type InventoryStatus = "in_stock" | "low_stock" | "out_of_stock" | "hidden";

export function getInventoryStatus(
  available: number,
  lowStockThreshold: number,
  hidden = false
): InventoryStatus {
  if (hidden) {
    return "hidden";
  }

  if (available <= 0) {
    return "out_of_stock";
  }

  if (available <= lowStockThreshold) {
    return "low_stock";
  }

  return "in_stock";
}

export function canReserve(available: number, quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0 && available >= quantity;
}
