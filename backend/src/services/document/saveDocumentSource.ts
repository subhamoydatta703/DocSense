import { prisma } from "../../config/db/db";
import type { SourceType } from "../../../prisma/generated/client";
import { deleteFile } from "../storage/s3storageService";

type Source = { s3Key: string; fileName: string; originalName: string; userId: string; sourceType: SourceType; sourceUrl?: string };

/** Serialize replacements with chunk writes. Each S3 key identifies an immutable upload. */
export async function saveDocumentSource(source: Source, replaceExisting = true) {
  try {
    const result = await prisma.$transaction(async tx => {
      const identity = `${source.userId}:${source.sourceType}:${source.sourceUrl || source.originalName}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity}))`;
      const existing = replaceExisting ? await tx.document.findFirst({
        where: { userId: source.userId, sourceType: source.sourceType,
          ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : { originalName: source.originalName }) },
      }) : null;
      if (!existing) return { document: await tx.document.create({ data: source }), oldKey: null };
      const locked = await tx.$queryRaw<Array<{ id: string; s3Key: string }>>`
        SELECT id, "s3Key" FROM "Document" WHERE id = ${existing.id} FOR UPDATE
      `;
      if (!locked[0]) return { document: await tx.document.create({ data: source }), oldKey: null };
      await tx.documentChunk.deleteMany({ where: { documentId: existing.id } });
      const document = await tx.document.update({ where: { id: existing.id }, data: { ...source, status: "PENDING" } });
      return { document, oldKey: locked[0].s3Key };
    }, { maxWait: 10_000, timeout: 10_000 });
    if (result.oldKey && result.oldKey !== source.s3Key) {
      await deleteFile(result.oldKey).catch(() => console.warn("Old source object cleanup failed", { documentId: result.document.id }));
    }
    return { Document: result.document };
  } catch (error) {
    await deleteFile(source.s3Key).catch(() => console.warn("Unreferenced source object cleanup failed"));
    throw error;
  }
}
