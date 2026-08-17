export const maximumComparisonProducts = 4;

/** Persistence boundary for customer-owned commerce preferences. */
export interface CustomerPreferencesRepository {
  listFavoriteProductIds(userId: string): Promise<string[]>;
  saveFavorite(input: { id: string; userId: string; productId: string }): Promise<void>;
  removeFavorite(userId: string, productId: string): Promise<void>;
  readComparisonProductIds(userId: string): Promise<string[]>;
  writeComparisonProductIds(userId: string, productIds: string[]): Promise<void>;
}

export type CustomerPreferencesIdFactory = () => string;

/**
 * Returns a stable, deduplicated comparison list. The cap is enforced in the
 * platform instead of being an accidental property of a database adapter.
 */
export function addComparisonProduct(current: readonly string[], productId: string): string[] {
  return [...new Set([...current, productId])].slice(0, maximumComparisonProducts);
}

export function removeComparisonProduct(current: readonly string[], productId: string): string[] {
  return current.filter((id) => id !== productId);
}

/** Reusable customer-preferences application service. */
export class CustomerPreferencesService {
  constructor(
    private readonly repository: CustomerPreferencesRepository,
    private readonly createId: CustomerPreferencesIdFactory
  ) {}

  listFavorites(userId: string): Promise<string[]> {
    return this.repository.listFavoriteProductIds(userId);
  }

  async saveFavorite(userId: string, productId: string): Promise<void> {
    await this.repository.saveFavorite({ id: this.createId(), userId, productId });
  }

  removeFavorite(userId: string, productId: string): Promise<void> {
    return this.repository.removeFavorite(userId, productId);
  }

  readComparison(userId: string): Promise<string[]> {
    return this.repository.readComparisonProductIds(userId);
  }

  async addComparison(userId: string, productId: string): Promise<string[]> {
    const next = addComparisonProduct(await this.repository.readComparisonProductIds(userId), productId);
    await this.repository.writeComparisonProductIds(userId, next);
    return next;
  }

  async removeComparison(userId: string, productId: string): Promise<string[]> {
    const next = removeComparisonProduct(await this.repository.readComparisonProductIds(userId), productId);
    await this.repository.writeComparisonProductIds(userId, next);
    return next;
  }
}
