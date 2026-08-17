import { createClientAppAdapters } from "../../src/adapters.js";
import { clientConfiguration } from "../../src/configuration.js";

/** Import this from the client storefront's framework entrypoint. */
export const storefrontAdapter = createClientAppAdapters(clientConfiguration).storefront;
