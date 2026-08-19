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

export type CustomerAddress = Record<string, unknown> & { id: string };

export interface CustomerAddressRepository {
  list(userId: string): Promise<CustomerAddress[]>;
  create(userId: string, address: CustomerAddress): Promise<void>;
  update(userId: string, addressId: string, patch: Record<string, unknown>): Promise<void>;
  softDelete(userId: string, addressId: string): Promise<void>;
}

/** Customer address operations with persistence abstracted from the API runtime. */
export class CustomerAddressService {
  constructor(
    private readonly repository: CustomerAddressRepository,
    private readonly createId: CustomerPreferencesIdFactory
  ) {}

  list(userId: string): Promise<CustomerAddress[]> {
    return this.repository.list(userId);
  }

  async create(userId: string, input: Record<string, unknown>): Promise<CustomerAddress> {
    const address = { ...input, id: this.createId() };
    await this.repository.create(userId, address);
    return address;
  }

  update(userId: string, addressId: string, patch: Record<string, unknown>): Promise<void> {
    return this.repository.update(userId, addressId, patch);
  }

  softDelete(userId: string, addressId: string): Promise<void> {
    return this.repository.softDelete(userId, addressId);
  }
}

export type CustomerProfileUpdate = {
  userId: string;
  email: string;
  roles: readonly string[];
  name?: string | undefined;
  locale?: "en" | "es" | undefined;
};

export interface CustomerProfileRepository {
  upsert(input: CustomerProfileUpdate): Promise<void>;
}

export class CustomerProfileService {
  constructor(private readonly repository: CustomerProfileRepository) {}

  async update(input: CustomerProfileUpdate): Promise<{ id: string; name?: string | undefined; locale?: "en" | "es" | undefined }> {
    await this.repository.upsert(input);
    return { id: input.userId, ...(input.name !== undefined ? { name: input.name } : {}), ...(input.locale !== undefined ? { locale: input.locale } : {}) };
  }
}
