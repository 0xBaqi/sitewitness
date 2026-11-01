import { z } from "zod";
import { findingSchema, reportSchema } from "./schema";

export const provenanceSchema = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("manual")}).strict(),
  z.object({kind:z.literal("ai"),model:z.string().min(1).max(100)}).strict(),
  z.object({kind:z.literal("legacy_unknown")}).strict(),
]);
const reviewKeys = findingSchema.shape.id;
export const reviewSchema = z.record(reviewKeys,z.enum(["unreviewed","accepted","rejected","investigate"]));
export const notesSchema = z.record(reviewKeys,z.string().max(1000));
export const savedSchema = z.object({
  id:z.string().min(1).max(100), date:z.string().max(100),
  question:z.string().max(500), filename:z.string().max(255),
  provenance:provenanceSchema.default({kind:"legacy_unknown"}),
  report:reportSchema, reviews:reviewSchema,
  edits:z.record(reviewKeys,z.string().max(1200)).optional(),
  notes:notesSchema.optional(),
});
export type Saved = z.infer<typeof savedSchema>;
export function provenanceLabel(value: Saved["provenance"]) {
  if (value.kind === "manual") return "Manual inspection · human-authored";
  if (value.kind === "ai") return `AI-generated · ${value.model} · human review required`;
  return "Legacy record · origin unverified";
}
export const photoMetadataSchema = z.object({
  id:z.string().uuid(), name:z.string().min(1).max(255),
  type:z.enum(["image/jpeg","image/png","image/webp"]),
  size:z.number().int().min(1).max(4*1024*1024),
}).strict();
export const manualSchema = savedSchema.extend({
  id:z.string().uuid(), date:z.string().datetime(), question:z.string().trim().min(1).max(500),
  provenance:z.object({kind:z.literal("manual")}).strict(),
  inspectionNotes:z.string().max(3000),
  photos:z.array(photoMetadataSchema).max(5).refine(p=>new Set(p.map(x=>x.id)).size===p.length),
  revision:z.number().int().nonnegative(),
}).strict().refine(record => {
  const ids=new Set(record.report.findings.map(f=>f.id));
  return record.report.findings.every(f=>f.title.trim() && f.description.trim()) && [record.reviews,record.edits??{},record.notes??{}].every(map=>Object.keys(map).every(id=>ids.has(id)));
},"Review metadata must refer to an observation in this inspection");
export type ManualInspection = z.infer<typeof manualSchema>;
export const manualNotice = "Human-authored inspection. No AI analysis was performed. Observations require professional verification and are not engineering certifications.";
export function newManualInspection(): ManualInspection {
  return {id:crypto.randomUUID(),date:new Date().toISOString(),question:"",filename:"",
    provenance:{kind:"manual"},report:{overview:"",findings:[],unanswered_questions:[],notice:manualNotice},
    reviews:{},edits:{},notes:{},inspectionNotes:"",photos:[],revision:0};
}
// Public writes cannot claim model generation. Future AI records must originate from an authorized server path.
export const manualServerRecordSchema = z.object({
  question:z.string().trim().min(1).max(500), report:reportSchema,
  provenance:z.object({kind:z.literal("manual")}).strict(),
  reviews:reviewSchema.optional(), notes:notesSchema.optional(),
  edits:z.record(reviewKeys,z.string().max(1200)).optional(),
  inspectionNotes:z.string().max(3000).optional(),
}).strict().refine(record=>{
  const ids=new Set(record.report.findings.map(f=>f.id));
  return record.report.findings.every(f=>f.title.trim() && f.description.trim()) && [record.reviews??{},record.edits??{},record.notes??{}].every(map=>Object.keys(map).every(id=>ids.has(id)));
});
