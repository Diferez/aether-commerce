import { describe, expect, it } from "vitest";
import { createAgentExecutionPlan } from "./execution";

describe("agent execution planning", () => {
  it("maps normalized intents to runtime-neutral capability groups", () => {
    expect(createAgentExecutionPlan("GET_CART")).toBe("cart_read");
    expect(createAgentExecutionPlan("ADD_TO_CART")).toBe("cart_mutation");
    expect(createAgentExecutionPlan("SEARCH_PRODUCTS")).toBe("product_discovery");
    expect(createAgentExecutionPlan("UNSUPPORTED")).toBe("unsupported");
  });
});
