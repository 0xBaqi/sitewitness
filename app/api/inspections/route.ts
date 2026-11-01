import { createInspectionHandler } from "../../../lib/server/inspections";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;
const handler = createInspectionHandler();
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
