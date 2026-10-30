import { z } from "zod";
import { reportSchema } from "./schema";
import type { Report } from "./schema";
export type Saved = {
  id: string;
  date: string;
  question: string;
  filename: string;
  report: Report;
  reviews: Record<string, string>;
  edits?: Record<string, string>;
  notes?: Record<string, string>;
};

export const savedSchema = z.object({
  id: z.string().min(1),
  date: z.string(),
  question: z.string(),
  filename: z.string(),
  report: reportSchema,
  reviews: z.record(z.string(), z.string()),
  edits: z.record(z.string(), z.string()).optional(),
  notes: z.record(z.string(), z.string()).optional(),
});
