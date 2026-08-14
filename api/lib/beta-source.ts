import { createHash } from "node:crypto";

export type SourceNote = { id: string; text: string; createdAt: string };

export function betaSourceSignature(notes: SourceNote[]) {
  return createHash("sha256").update(JSON.stringify(
    [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(({ id, text, createdAt }) => ({ id, text, createdAt })),
  )).digest("hex");
}
