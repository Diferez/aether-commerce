import { createClientAppAdapters } from "../../src/adapters";
import { clientConfiguration } from "../../src/configuration";

/** Pass this to the client API adapter; secrets belong to its platform bindings. */
export const apiAdapter = createClientAppAdapters(clientConfiguration).api;
