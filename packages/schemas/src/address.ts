import { z } from "zod";

// Shared by cart (shippingAddress collected at checkout) and order
// (shippingAddress persisted on the placed order) - lives below both in the
// dependency graph so neither has to import from the other.
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

export type Address = z.infer<typeof addressSchema>;
