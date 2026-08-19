import { describe, expect, it } from "vitest";
import type { Actor } from "@aether/schemas";
import { hasPermission, isDemoMutationBlocked, permissionsForRoles } from "./rbac";

function actorWithRoles(roles: Actor["roles"]): Actor {
  return { roles, permissions: permissionsForRoles(roles), mode: "private" };
}

describe("permissionsForRoles", () => {
  it("grants users.write to admin but not users.manage_roles", () => {
    const permissions = permissionsForRoles(["admin"]);
    expect(permissions).toContain("users.write");
    expect(permissions).not.toContain("users.manage_roles");
  });

  it("grants both users.write and users.manage_roles to super_admin", () => {
    const permissions = permissionsForRoles(["super_admin"]);
    expect(permissions).toContain("users.write");
    expect(permissions).toContain("users.manage_roles");
  });

  it("keeps support read-only on users", () => {
    const permissions = permissionsForRoles(["support"]);
    expect(permissions).toContain("users.read");
    expect(permissions).not.toContain("users.write");
    expect(permissions).not.toContain("users.manage_roles");
  });
});

describe("hasPermission", () => {
  it("confirms an admin actor cannot manage roles", () => {
    expect(hasPermission(actorWithRoles(["admin"]), "users.manage_roles")).toBe(false);
  });

  it("confirms a super_admin actor can manage roles", () => {
    expect(hasPermission(actorWithRoles(["super_admin"]), "users.manage_roles")).toBe(true);
  });
});

describe("isDemoMutationBlocked", () => {
  it("blocks non-GET methods in demo mode", () => {
    const actor: Actor = { roles: ["admin"], permissions: [], mode: "demo" };
    expect(isDemoMutationBlocked(actor, "PATCH")).toBe(true);
    expect(isDemoMutationBlocked(actor, "GET")).toBe(false);
  });
});
