import { describe, expect, it } from "vitest";
import { AdministrationService, type AdministrationRepository } from "./administration";

describe("administration service", () => {
  it("delegates platform administration reads through the storage port", async () => {
    const calls: string[] = [];
    const repository: AdministrationRepository = {
      listUsers: () => { calls.push("users"); return Promise.resolve([{ id: "user" }]); },
      listAuditLogs: () => { calls.push("audit"); return Promise.resolve([{ id: "audit" }]); },
      listApplicationSettings: () => { calls.push("settings"); return Promise.resolve([{ key: "shipping" }]); }
    };
    const service = new AdministrationService(repository);
    await expect(service.listUsers()).resolves.toEqual([{ id: "user" }]);
    await expect(service.listAuditLogs()).resolves.toEqual([{ id: "audit" }]);
    await expect(service.listApplicationSettings()).resolves.toEqual([{ key: "shipping" }]);
    expect(calls).toEqual(["users", "audit", "settings"]);
  });
});
