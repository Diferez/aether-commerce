"use client";

// One-time cleanup of pre-DummyJSON-migration localStorage. Cart/wishlist
// used to store bare "platzi_<id>" product references; those ids don't
// resolve against the new catalog at all, so carrying them forward would
// silently produce a cart full of phantom items. We drop the old keys
// rather than attempt a data migration, since there is no valid mapping
// from a Platzi id to a DummyJSON product.
const migrationFlagKey = "aether.legacyMigration.dummyjson.v1";
const legacyCartKeys = ["aether.cartId", "aether.localCartItems"];
const legacyCartTokenKey = "aether.cartToken";

export function migrateLegacyAetherStorage(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.localStorage.getItem(migrationFlagKey) === "done") {
    return false;
  }

  let clearedSomething = false;

  for (const key of legacyCartKeys) {
    if (window.localStorage.getItem(key) !== null) {
      window.localStorage.removeItem(key);
      clearedSomething = true;
    }
  }
  if (window.sessionStorage.getItem(legacyCartTokenKey) !== null) {
    window.sessionStorage.removeItem(legacyCartTokenKey);
  }

  for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith("aether.favoritesItems.") && !key.endsWith(".dummyjson.v1")) {
      window.localStorage.removeItem(key);
      clearedSomething = true;
    }
  }

  window.localStorage.setItem(migrationFlagKey, "done");
  return clearedSomething;
}
