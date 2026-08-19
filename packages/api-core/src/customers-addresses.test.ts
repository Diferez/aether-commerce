import { describe, expect, it } from "vitest";
import { CustomerAddressService, type CustomerAddress, type CustomerAddressRepository } from "./customers";

describe("customer addresses", () => {
  it("uses the repository port and keeps identifier generation in the domain service", async () => {
    let addresses: CustomerAddress[] = [];
    const repository: CustomerAddressRepository = {
      list: () => Promise.resolve(addresses),
      create: (_userId, address) => {
        addresses = [...addresses, address];
        return Promise.resolve();
      },
      update: (_userId, addressId, patch) => {
        addresses = addresses.map((address) => (address.id === addressId ? { ...address, ...patch } : address));
        return Promise.resolve();
      },
      softDelete: (_userId, addressId) => {
        addresses = addresses.filter((address) => address.id !== addressId);
        return Promise.resolve();
      }
    };
    const service = new CustomerAddressService(repository, () => "generated-address-id");

    const created = await service.create("customer", { id: "untrusted-id", country: "CO", fullName: "Ada" });
    expect(created.id).toBe("generated-address-id");
    expect(await service.list("customer")).toEqual([created]);

    await service.update("customer", created.id, { label: "Home" });
    expect(await service.list("customer")).toEqual([{ ...created, label: "Home" }]);

    await service.softDelete("customer", created.id);
    expect(await service.list("customer")).toEqual([]);
  });
});
