import { createClientAppAdapters } from "../../src/adapters";
import { clientConfiguration } from "../../src/configuration";

/** Import this from the client storefront's framework entrypoint. */
export const storefrontAdapter = createClientAppAdapters(clientConfiguration).storefront;
