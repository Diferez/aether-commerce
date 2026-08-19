import { z } from "zod";

export const contactMessageSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  company: z.string().max(160).optional(),
  subject: z.string().min(3).max(160),
  message: z.string().min(10).max(4000),
  consent: z.boolean().default(false),
  privacyVersion: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default("2026-08-12"),
  website: z.string().max(0).optional(),
  locale: z.enum(["en", "es"]).default("en")
});

export type ContactMessage = z.infer<typeof contactMessageSchema>;
