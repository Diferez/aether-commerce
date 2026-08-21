import { describe, expect, it } from "vitest";
import type { Env } from "../types";
import { getRuntimeStoreConfig } from "./store-config";

describe("getRuntimeStoreConfig", () => {
  it("normalizes configured store values", () => {
    expect(getRuntimeStoreConfig({ STORE_CURRENCY: "cop", STORE_LOCALE: "es-CO", STORE_COUNTRY: "co" } as Env)).toEqual({
      currency: "COP",
      locale: "es-CO",
      country: "CO"
    });
  });

  it("falls back when vars are missing or malformed", () => {
    expect(getRuntimeStoreConfig({ STORE_CURRENCY: "dollars", STORE_COUNTRY: "Colombia" } as Env)).toEqual({
      currency: "USD",
      locale: "en-US",
      country: "US"
    });
  });
});
