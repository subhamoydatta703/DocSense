import { prisma } from "../../config/db/db";
import { hasReadableText } from "../../utils/sourceText";

/** Maintenance scan. No document writes unless apply is explicitly true. */
export async function reindexUnreadableSources(apply = false, userId?: string) {
  let cursor: string | undefined;
  let affected = 0;
  let markedPending = 0;
  while (true) {
    const documents = await prisma.document.findMany({
      where: { status: "COMPLETED", ...(userId ? { userId } : {}), ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" }, take: 100,
      select: { id: true, s3Key: true, chunks: { select: { content: true } } },
    });
    if (!documents.length) break;
    for (const document of documents) {
      if (document.chunks.some(chunk => hasReadableText(chunk.content))) continue;
      affected++;
      console.info("Unreadable stored source", { documentId: document.id, chunkCount: document.chunks.length, mode: apply ? "apply" : "dry-run" });
      if (!apply) continue;
      const changed = await prisma.$transaction(async tx => {
        const current = await tx.$queryRaw<Array<{ s3Key: string; status: string }>>`
          SELECT "s3Key", status FROM "Document" WHERE id = ${document.id} FOR UPDATE
        `;
        if (current[0]?.s3Key !== document.s3Key || current[0]?.status !== "COMPLETED") return false;
        const chunks = await tx.documentChunk.findMany({ where: { documentId: document.id }, select: { content: true } });
        if (chunks.some(chunk => hasReadableText(chunk.content))) return false;
        await tx.documentChunk.deleteMany({ where: { documentId: document.id } });
        await tx.document.update({ where: { id: document.id }, data: { status: "PENDING", failureReason: null } });
        return true;
      });
      if (changed) markedPending++;
    }
    cursor = documents.at(-1)!.id;
  }
  return { affected, markedPending };
}
