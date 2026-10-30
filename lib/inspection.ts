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
