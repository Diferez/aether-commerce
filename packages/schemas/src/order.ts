import { z } from "zod";
import { cartItemSchema, cartTotalsSchema, currencyCodeSchema } from "./cart";

export const orderStateSchema = z.enum([
  "draft",
  "pending_payment",
  "payment_processing",
  "payment_failed",
  "paid",
  "processing",
  "packed",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refund_requested",
  "partially_refunded",
  "refunded",
  "return_requested",
  "returned",
  "closed"
]);

export const orderItemSnapshotSchema = z.object({
  externalProductId: z.number().int().nullable(),
  productId: z.string().min(1),
  productName: z.string().min(1),
  productSlug: z.string().min(1),
  productImage: z.string().url(),
  sku: z.string().min(1),
  selectedVariant: z.string().nullable(),
  unitPrice: z.number().int().min(0),
  originalPrice: z.number().int().min(0).nullable(),
  discount: z.number().int().min(0),
  quantity: z.number().int().min(1),
  subtotal: z.number().int().min(0)
});

export const addressSchema = z.object({
  id: z.string().min(1).optional(),
  fullName: z.string().min(2),
  line1: z.string().min(3),
  line2: z.string().optional(),
  city: z.string().min(2),
  region: z.string().min(2),
  postalCode: z.string().min(3),
  country: z.string().length(2),
  phone: z.string().optional()
});

export const paymentSchema = z.object({
  provider: z.string().min(1),
  providerSessionId: z.string().optional(),
  providerPaymentIntentId: z.string().optional(),
  status: z.enum(["created", "requires_payment", "paid", "failed", "refunded"]),
  amount: z.number().int().min(0),
  currency: currencyCodeSchema
});

export const orderChannelSchema = z.enum(["stripe", "wompi", "whatsapp"]);
export const paymentStatusSchema = z.enum(["pending", "paid", "failed", "refunded", "partially_refunded"]);
export const fulfillmentStatusSchema = z.enum(["unfulfilled", "processing", "shipped", "delivered", "cancelled"]);

export const shipmentSchema = z.object({
  carrier: z.string().min(1),
  trackingNumber: z.string().min(1),
  trackingUrl: z.string().url().optional(),
  status: z.enum(["label_created", "in_transit", "delivered", "exception"])
});

export const orderSchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1),
  userId: z.string().min(1).optional(),
  email: z.string().email(),
  state: orderStateSchema,
  channel: orderChannelSchema,
  paymentStatus: paymentStatusSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
  items: z.array(cartItemSchema).min(1),
  totals: cartTotalsSchema,
  shippingAddress: addressSchema,
  payment: paymentSchema.optional(),
  shipment: shipmentSchema.optional(),
  internalNotes: z.string().max(2000).nullable(),
  tracking: z
    .object({
      carrier: z.string().nullable(),
      number: z.string().nullable(),
      url: z.string().url().nullable()
    })
    .nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type OrderState = z.infer<typeof orderStateSchema>;
export type OrderChannel = z.infer<typeof orderChannelSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type FulfillmentStatus = z.infer<typeof fulfillmentStatusSchema>;
export type OrderItemSnapshot = z.infer<typeof orderItemSnapshotSchema>;
export type Address = z.infer<typeof addressSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type Shipment = z.infer<typeof shipmentSchema>;
export type Order = z.infer<typeof orderSchema>;
