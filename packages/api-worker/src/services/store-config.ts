import type { Env } from "../types";

const currencyPattern = /^[A-Z]{3}$/;
const countryPattern = /^[A-Z]{2}$/;

export type RuntimeStoreConfig = {
  currency: string;
  locale: string;
  country: string;
};

/** Reads safe per-store defaults from Worker vars without trusting malformed values. */
export function getRuntimeStoreConfig(env: Env): RuntimeStoreConfig {
  const currency = env.STORE_CURRENCY?.trim().toUpperCase();
  const country = env.STORE_COUNTRY?.trim().toUpperCase();
  const locale = env.STORE_LOCALE?.trim();

  return {
    currency: currency && currencyPattern.test(currency) ? currency : "USD",
    locale: locale || "en-US",
    country: country && countryPattern.test(country) ? country : "US"
  };
}
