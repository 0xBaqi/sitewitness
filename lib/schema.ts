import { z } from "zod";
export const findingSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(
      (id) => !["__proto__", "prototype", "constructor"].includes(id),
      "Reserved finding id",
    ),
  category: z.enum(["observation", "potential_concern", "needs_verification"]),
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(1200),
  evidence: z.string().max(800),
  limitation: z.string().max(800),
});
export const reportSchema = z.object({
  overview: z.string().max(1500),
  findings: z
    .array(findingSchema)
    .max(24)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      "Duplicate finding ids",
    ),
  unanswered_questions: z.array(z.string().max(300)).max(8),
  notice: z.string().max(400),
});
export type Report = z.infer<typeof reportSchema>;
export type Finding = z.infer<typeof findingSchema>;
