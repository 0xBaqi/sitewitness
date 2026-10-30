import { createAnalyzeHandler } from "../../../lib/server/analyze";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = createAnalyzeHandler();
