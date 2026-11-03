import { z } from "zod";
import source from "./evidence/captured.json";
import { reportSchema } from "./schema";
import type { Saved } from "./inspection";

export const captured = {...source, report:reportSchema.parse(source.report)};
export const audit = [
  "Timber forms, cross-battens and diagonal props are visible. Small platforms and the material/fixity of every prop are not reliably established. No conclusion about stability or alignment follows from this view.",
  "Exposed vertical reinforcement with transverse ties is visible, especially at right. Exact bar sizes, spacing, laps, cover, anchorage and condition require drawings and direct inspection. No reinforcement defect is established.",
  "Low concrete elements, bare earth and loose materials are visible. Their continuity, structural role and connection to every column base are not established. Do not infer foundation depth, soil capacity or a housekeeping violation.",
  "Several people and some high-visibility clothing are visible; one figure is partly obscured. Exact headcount, helmets for every person, roles and PPE compliance are not reliably established. Trees and daylight are visible.",
];
export const questionAudit = [
  "Relevant request for design evidence. Beams and concrete specifications are not confirmed by this photo; ask for approved details and records for the elements shown.",
  "Relevant unknowns. Use approved foundation drawings, available geotechnical information and verified dimensions. This question does not establish a foundation or soil defect or justify new excavation.",
  "Relevant context. Ask the site team for the photograph date, work stage and planned sequence; do not infer them from appearance alone.",
];
const findingId=z.enum(["f1","f2","f3","f4"]);
export const humanReviewSchema=z.object({
  sourceId:z.literal("muse-spark-2026-11-03-attempt-2"),
  revision:z.number().int().nonnegative(), savedAt:z.string().datetime().nullable(),
  reviewer:z.string().max(120),
  reviews:z.partialRecord(findingId,z.enum(["unreviewed","accepted","rejected","investigate"])),
  edits:z.partialRecord(findingId,z.string().max(1200)),
  notes:z.partialRecord(findingId,z.string().max(1000)),
  answers:z.array(z.string().max(1000)).length(3),
}).strict();
export type HumanReview=z.infer<typeof humanReviewSchema>;
export function newReview():HumanReview{return {sourceId:"muse-spark-2026-11-03-attempt-2",revision:0,savedAt:null,reviewer:"",reviews:{},edits:{},notes:{},answers:["","",""]};}
export function asSaved(review:HumanReview):Saved {
  return {id:captured.id,date:captured.generatedAt,question:"Captured construction photograph",filename:"captured-construction.jpg",provenance:{kind:"ai",model:captured.model},report:captured.report,reviews:review.reviews,edits:review.edits,notes:review.notes};
}
export async function fingerprint(blob:Blob){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer())),b=>b.toString(16).padStart(2,"0")).join("");}
export async function matchesCapturedPhoto(blob:Blob){
  if(!blob.size||blob.size>4*1024*1024)return false;
  const hash=await fingerprint(blob);
  return hash===captured.imageSha256||hash===captured.originalImageSha256;
}
