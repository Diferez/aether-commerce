import { describe, expect, it } from "vitest";
import { CustomerProfileService, type CustomerProfileRepository } from "./customers";

describe("customer profile", () => {
  it("delegates account persistence while returning the public profile update", async () => {
    let persistedName: string | undefined;
    const repository: CustomerProfileRepository = {
      upsert: (input) => {
        persistedName = input.name;
        return Promise.resolve();
      }
    };
    const service = new CustomerProfileService(repository);

    await expect(service.update({ userId: "customer", email: "customer@example.com", roles: ["customer"], name: "Ada", locale: "es" }))
      .resolves.toEqual({ id: "customer", name: "Ada", locale: "es" });
    expect(persistedName).toBe("Ada");
  });
});
