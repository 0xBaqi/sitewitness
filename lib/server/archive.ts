import { z } from "zod";
import sharp from "sharp";
import { manualSchema, manualNotice } from "../inspection";
const schema=z.object({format:z.literal("sitewitness-manual-v1"),provenance:z.object({kind:z.literal("manual")}).strict(),inspection:manualSchema,photographs:z.array(z.object({id:z.string().uuid(),dataUrl:z.string().max(5600000)}).strict()).max(5)}).strict();
export async function validateArchive(input:unknown) {
 const archive=schema.parse(input);
 if(archive.photographs.length!==archive.inspection.photos.length)throw new Error("Missing photographs");
 for(let i=0;i<archive.photographs.length;i++) {
  const photo=archive.photographs[i], meta=archive.inspection.photos[i];
  const prefix=`data:${meta.type};base64,`;
  if(photo.id!==meta.id || !photo.dataUrl.startsWith(prefix))throw new Error("Invalid photograph");
  const encoded=photo.dataUrl.slice(prefix.length), bytes=Buffer.from(encoded,"base64");
  if(bytes.toString("base64")!==encoded || bytes.length!==meta.size)throw new Error("Invalid encoding");
  const image=sharp(bytes,{limitInputPixels:24000000});
  const info=await image.metadata();
  if(info.format!==({"image/jpeg":"jpeg","image/png":"png","image/webp":"webp"} as const)[meta.type])throw new Error("Invalid format");
  await image.stats();
 }
 archive.inspection.report.notice=manualNotice;
 return archive;
}
