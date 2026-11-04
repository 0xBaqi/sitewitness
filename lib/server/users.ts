import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ServiceError } from "./errors";

const usersSchema = z.array(z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()).min(1).max(100).refine(users =>
  new Set(users.map(user => user.id)).size === users.length &&
  new Set(users.map(user => user.tokenHash)).size === users.length,
);

export type ConfiguredUser = z.infer<typeof usersSchema>[number];

export function parseConfiguredUsers(raw: string | undefined): ConfiguredUser[] {
  try { return usersSchema.parse(JSON.parse(raw ?? "")); }
  catch { throw new ServiceError(503, "Inspection access is not configured."); }
}

export function authenticateUser(token: string, users: ConfiguredUser[]): ConfiguredUser {
  if (!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(token))
    throw new ServiceError(401, "Invalid inspection credentials.");
  const digest = createHash("sha256").update(token.slice(7)).digest();
  let matched: ConfiguredUser | undefined;
  for (const user of users) {
    const expected = Buffer.from(user.tokenHash, "hex");
    if (timingSafeEqual(digest, expected)) matched = user;
  }
  if (!matched) throw new ServiceError(401, "Invalid inspection credentials.");
  return matched;
}
