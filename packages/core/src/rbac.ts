import type { Actor, Permission, Role } from "@aether/schemas";

const rolePermissions: Record<Role, Permission[]> = {
  guest: ["products.read"],
  customer: ["products.read"],
  support: ["products.read", "orders.read", "users.read", "reviews.moderate", "contacts.read"],
  catalog_manager: ["products.read", "products.write", "inventory.read", "inventory.write"],
  order_manager: ["products.read", "orders.read", "orders.write", "refunds.create", "exports.create"],
  demo_viewer: ["products.read", "inventory.read", "orders.read", "audit.read"],
  admin: [
    "products.read",
    "products.write",
    "inventory.read",
    "inventory.write",
    "orders.read",
    "orders.write",
    "refunds.create",
    "users.read",
    "reviews.moderate",
    "contacts.read",
    "coupons.manage",
    "settings.manage",
    "audit.read",
    "exports.create"
  ],
  super_admin: [
    "products.read",
    "products.write",
    "inventory.read",
    "inventory.write",
    "orders.read",
    "orders.write",
    "refunds.create",
    "users.read",
    "reviews.moderate",
    "contacts.read",
    "coupons.manage",
    "settings.manage",
    "audit.read",
    "exports.create"
  ]
};

export function permissionsForRoles(roles: Role[]): Permission[] {
  return [...new Set(roles.flatMap((role) => rolePermissions[role] ?? []))];
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return actor.permissions.includes(permission) || permissionsForRoles(actor.roles).includes(permission);
}

export function isDemoMutationBlocked(actor: Actor, method: string): boolean {
  return actor.mode === "demo" && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}
