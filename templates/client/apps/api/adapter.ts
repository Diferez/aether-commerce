import { createClientAppAdapters } from "../../src/adapters.js";
import { clientConfiguration } from "../../src/configuration.js";

/** Pass this to the client API adapter; secrets belong to its platform bindings. */
export const apiAdapter = createClientAppAdapters(clientConfiguration).api;
