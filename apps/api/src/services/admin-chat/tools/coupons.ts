import { z } from "zod";
import { defineAdminChatTool } from "../define-tool";
import { createPendingAction } from "../pending-actions";
import { pick } from "../language";
import { writeAuditLog } from "../../audit";
import { createCouponService } from "../../coupons";
import type { ActionDiff } from "../artifacts";
import type { PendingActionExecutor } from "../executors";

type CouponRow = { code: string; type: string; value: number; active: number; minimum_subtotal: number };

function formatCouponValue(row: Pick<CouponRow, "type" | "value">): string {
  return row.type === "percentage" ? `${row.value}%` : `$${(row.value / 100).toFixed(2)}`;
}

// Read-only - lists every coupon row (active and deactivated alike, same as
// GET /admin/coupons) so the operator can ask "which coupons do we have"
// without first knowing a specific code.
export const listCouponsTool = defineAdminChatTool({
  name: "list_coupons",
  description: "Lists every discount coupon (active and deactivated), with its type, value, and minimum subtotal.",
  schema: z.object({}),
  requires: { permission: "coupons.manage" },
  run: async (_args, ctx) => {
    const rows = (await createCouponService(ctx.env.DB).list()) as unknown as CouponRow[];
    const active = rows.filter((row) => row.active === 1);
    return {
      message:
        rows.length === 0
          ? pick(ctx.language, "There are no coupons yet.", "Todavía no hay cupones.")
          : pick(
              ctx.language,
              `${rows.length} coupon(s), ${active.length} active.`,
              `${rows.length} cupón(es), ${active.length} activo(s).`
            ),
      artifact: { type: "dashboard_summary", summary: { coupons: rows.length, active: active.length } }
    };
  }
});

async function loadCoupon(db: D1Database, rawCode: string): Promise<CouponRow | null> {
  const code = rawCode.trim().toUpperCase();
  const row = await db.prepare("select code, type, value, active, minimum_subtotal from coupons where code = ?").bind(code).first<CouponRow>();
  return row ?? null;
}

// Mirrors POST /admin/coupons' own validation exactly (routes/admin.ts) -
// same field names/limits, so a coupon created through chat behaves
// identically to one created through the admin Coupons page.
export const prepareCreateCouponTool = defineAdminChatTool({
  name: "prepare_create_coupon",
  description: "Prepares creating a new discount coupon (percentage or fixed amount). Returns a preview that must be confirmed before anything is created.",
  schema: z.object({
    code: z.string().trim().min(3).max(32),
    type: z.enum(["percentage", "fixed"]),
    value: z.number().int().positive().describe("Percentage points (e.g. 10 for 10%) or cents for a fixed amount"),
    minimumSubtotal: z.number().int().min(0).default(0).describe("Minimum cart subtotal in cents required to use this coupon")
  }),
  requires: { permission: "coupons.manage", mutation: true },
  run: async (args, ctx) => {
    const code = args.code.toUpperCase();
    const valueLabel = formatCouponValue(args);
    const diff: ActionDiff = {
      summary: pick(ctx.language, `Create coupon "${code}" (${valueLabel} off)`, `Crear cupón "${code}" (${valueLabel} de descuento)`),
      targetLabel: code,
      fields: [
        { field: "code", before: null, after: code },
        { field: "type", before: null, after: args.type },
        { field: "value", before: null, after: args.value },
        { field: "minimumSubtotal", before: null, after: args.minimumSubtotal }
      ],
      consequences: [pick(ctx.language, "Active immediately - shoppers can apply it at checkout right away.", "Activo de inmediato - los compradores pueden aplicarlo en el pago de inmediato.")]
    };
    const { operationId, expiresAt } = await createPendingAction(ctx.env, {
      conversationId: ctx.conversationId,
      actorId: ctx.actor.userId ?? "admin",
      toolName: "prepare_create_coupon",
      targetType: "coupon",
      targetId: code,
      params: { code, type: args.type, value: args.value, minimumSubtotal: args.minimumSubtotal },
      diff,
      requestId: ctx.requestId
    });
    return {
      message: pick(ctx.language, `Ready to create coupon "${code}". Please confirm.`, `Listo para crear el cupón "${code}". Por favor confirma.`),
      artifact: { type: "pending_action", operationId, toolName: "prepare_create_coupon", diff, expiresAt }
    };
  }
});

export const executeCreateCoupon: PendingActionExecutor = async (ctx, params) => {
  const { code, type, value, minimumSubtotal } = params as { code: string; type: string; value: number; minimumSubtotal: number };
  await ctx.env.DB.prepare("insert or replace into coupons (code, type, value, active, minimum_subtotal) values (?, ?, ?, 1, ?)")
    .bind(code, type, value, minimumSubtotal)
    .run();
  await writeAuditLog(ctx.env, {
    actorId: ctx.actor.userId ?? "admin",
    action: "coupon.created",
    targetType: "coupon",
    targetId: code,
    payload: { type, value, minimumSubtotal, source: "admin_chat" }
  });
  return { success: true, result: { code } };
};

export const prepareDeactivateCouponTool = defineAdminChatTool({
  name: "prepare_deactivate_coupon",
  description: "Prepares deactivating a discount coupon so shoppers can no longer apply it. Returns a preview that must be confirmed before anything changes.",
  schema: z.object({ code: z.string().trim().min(1).max(32) }),
  requires: { permission: "coupons.manage", mutation: true },
  run: async (args, ctx) => {
    const coupon = await loadCoupon(ctx.env.DB, args.code);
    if (!coupon) {
      return { message: pick(ctx.language, `No coupon found with code "${args.code.toUpperCase()}".`, `No se encontró ningún cupón con el código "${args.code.toUpperCase()}".`), artifact: { type: "error", code: "COUPON_NOT_FOUND", message: "Coupon not found." } };
    }
    if (coupon.active === 0) {
      return { message: pick(ctx.language, `Coupon "${coupon.code}" is already inactive.`, `El cupón "${coupon.code}" ya está inactivo.`), artifact: { type: "text" } };
    }
    const diff: ActionDiff = {
      summary: pick(ctx.language, `Deactivate coupon "${coupon.code}"`, `Desactivar el cupón "${coupon.code}"`),
      targetLabel: coupon.code,
      fields: [{ field: "active", before: true, after: false }],
      consequences: [pick(ctx.language, "Shoppers will no longer be able to apply this coupon.", "Los compradores ya no podrán aplicar este cupón.")]
    };
    const { operationId, expiresAt } = await createPendingAction(ctx.env, {
      conversationId: ctx.conversationId,
      actorId: ctx.actor.userId ?? "admin",
      toolName: "prepare_deactivate_coupon",
      targetType: "coupon",
      targetId: coupon.code,
      params: { code: coupon.code },
      diff,
      requestId: ctx.requestId
    });
    return {
      message: pick(ctx.language, `Ready to deactivate coupon "${coupon.code}". Please confirm.`, `Listo para desactivar el cupón "${coupon.code}". Por favor confirma.`),
      artifact: { type: "pending_action", operationId, toolName: "prepare_deactivate_coupon", diff, expiresAt }
    };
  }
});

export const executeDeactivateCoupon: PendingActionExecutor = async (ctx, params) => {
  const { code } = params as { code: string };
  const result = await ctx.env.DB.prepare("update coupons set active = 0, updated_at = CURRENT_TIMESTAMP where code = ? and active = 1").bind(code).run();
  if ((result.meta.changes ?? 0) !== 1) {
    return { success: false, code: "COUPON_ALREADY_INACTIVE", message: pick(ctx.language, `Coupon "${code}" is already inactive.`, `El cupón "${code}" ya está inactivo.`) };
  }
  await writeAuditLog(ctx.env, {
    actorId: ctx.actor.userId ?? "admin",
    action: "coupon.deactivated",
    targetType: "coupon",
    targetId: code,
    payload: { source: "admin_chat" }
  });
  return { success: true, result: { code, active: false } };
};
