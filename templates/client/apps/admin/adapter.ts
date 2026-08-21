import { createClientAppAdapters } from "../../src/adapters";
import { clientConfiguration } from "../../src/configuration";

/** Import this from the client admin's framework entrypoint. */
export const adminAdapter = createClientAppAdapters(clientConfiguration).admin;
