import { createInspectionHandler } from "../../../lib/server/inspections";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const handler=createInspectionHandler({archives:true});
export const GET=handler;
export const POST=handler;
export const DELETE=handler;
