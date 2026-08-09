import { z } from "zod";

export const cartItemInputSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.number().int().min(1).max(25)
});

export const cartItemSchema = cartItemInputSchema.extend({
  name: z.string().min(1),
  slug: z.string().min(1),
  imageUrl: z.string().url(),
  unitPrice: z.number().int().min(0),
  finalUnitPrice: z.number().int().min(0),
  lineTotal: z.number().int().min(0),
  currency: z.literal("USD")
});

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(32),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().int().positive(),
  active: z.boolean(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  minimumSubtotal: z.number().int().min(0).default(0)
});

export const cartTotalsSchema = z.object({
  subtotal: z.number().int().min(0),
  discount: z.number().int().min(0),
  shipping: z.number().int().min(0),
  tax: z.number().int().min(0),
  total: z.number().int().min(0),
  currency: z.literal("USD")
});

export const cartSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1).optional(),
  anonymousId: z.string().min(1).optional(),
  items: z.array(cartItemSchema),
  couponCode: z.string().optional(),
  totals: cartTotalsSchema,
  updatedAt: z.string().datetime()
});

export type CartItemInput = z.infer<typeof cartItemInputSchema>;
export type CartItem = z.infer<typeof cartItemSchema>;
export type Coupon = z.infer<typeof couponSchema>;
export type CartTotals = z.infer<typeof cartTotalsSchema>;
export type Cart = z.infer<typeof cartSchema>;
