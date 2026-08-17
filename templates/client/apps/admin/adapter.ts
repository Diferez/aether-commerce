import { createClientAppAdapters } from "../../src/adapters.js";
import { clientConfiguration } from "../../src/configuration.js";

/** Import this from the client admin's framework entrypoint. */
export const adminAdapter = createClientAppAdapters(clientConfiguration).admin;
