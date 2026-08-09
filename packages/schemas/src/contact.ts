import { z } from "zod";

export const contactMessageSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  company: z.string().max(160).optional(),
  subject: z.string().min(3).max(160),
  message: z.string().min(10).max(4000),
  consent: z.boolean().default(false),
  website: z.string().max(0).optional(),
  locale: z.enum(["en", "es"]).default("en")
});

export type ContactMessage = z.infer<typeof contactMessageSchema>;
