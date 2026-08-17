import { createClientAppAdapters } from "../../src/adapters.js";
import { clientConfiguration } from "../../src/configuration.js";

/** Pass this public context into a client-specific Agent Core runtime adapter. */
export const aiAdapter = createClientAppAdapters(clientConfiguration).ai;
