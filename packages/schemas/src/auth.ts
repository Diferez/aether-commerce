import { z } from "zod";

export const roleSchema = z.enum([
  "guest",
  "customer",
  "support",
  "catalog_manager",
  "order_manager",
  "admin",
  "super_admin",
  "demo_viewer"
]);

export const permissionSchema = z.enum([
  "products.read",
  "products.write",
  "inventory.read",
  "inventory.write",
  "orders.read",
  "orders.write",
  "refunds.create",
  "users.read",
  "users.write",
  "users.manage_roles",
  "reviews.moderate",
  "contacts.read",
  "coupons.manage",
  "settings.manage",
  "audit.read",
  "exports.create",
  "platform.deploy"
]);

export const actorSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
  roles: z.array(roleSchema),
  permissions: z.array(permissionSchema),
  mode: z.enum(["public", "private", "demo"])
});

export type Role = z.infer<typeof roleSchema>;
export type Permission = z.infer<typeof permissionSchema>;
export type Actor = z.infer<typeof actorSchema>;
