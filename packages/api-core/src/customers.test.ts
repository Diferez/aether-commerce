import { describe, expect, it } from "vitest";
import {
  addComparisonProduct,
  CustomerPreferencesService,
  maximumComparisonProducts,
  removeComparisonProduct,
  type CustomerPreferencesRepository
} from "./customers";

describe("customer preferences", () => {
  it("deduplicates comparisons and preserves the configured cap", () => {
    expect(addComparisonProduct(["one", "two", "one"], "three")).toEqual(["one", "two", "three"]);
    expect(addComparisonProduct(["one", "two", "three", "four"], "five")).toHaveLength(maximumComparisonProducts);
    expect(removeComparisonProduct(["one", "two"], "one")).toEqual(["two"]);
  });

  it("uses the repository port for customer-owned preferences", async () => {
    const favorites = new Set<string>();
    let comparison = ["one"];
    const repository: CustomerPreferencesRepository = {
      listFavoriteProductIds: () => Promise.resolve([...favorites]),
      saveFavorite: ({ productId }) => {
        favorites.add(productId);
        return Promise.resolve();
      },
      removeFavorite: (_userId, productId) => {
        favorites.delete(productId);
        return Promise.resolve();
      },
      readComparisonProductIds: () => Promise.resolve(comparison),
      writeComparisonProductIds: (_userId, productIds) => {
        comparison = productIds;
        return Promise.resolve();
      }
    };
    const service = new CustomerPreferencesService(repository, () => "favorite-id");

    await service.saveFavorite("customer", "product");
    expect(await service.listFavorites("customer")).toEqual(["product"]);
    expect(await service.addComparison("customer", "two")).toEqual(["one", "two"]);
    expect(await service.removeComparison("customer", "one")).toEqual(["two"]);
  });
});
