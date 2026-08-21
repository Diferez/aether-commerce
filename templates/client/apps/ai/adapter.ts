import { createClientAppAdapters } from "../../src/adapters";
import { clientConfiguration } from "../../src/configuration";

/** Pass this public context into a client-specific Agent Core runtime adapter. */
export const aiAdapter = createClientAppAdapters(clientConfiguration).ai;
