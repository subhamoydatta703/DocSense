import { prisma } from "../../config/db/db";
import type { SourceType } from "../../../prisma/generated/client";
import { deleteFile } from "../storage/s3storageService";

type Source = { s3Key: string; fileName: string; originalName: string; userId: string; sourceType: SourceType; sourceUrl?: string };

/** Adding a source never changes another upload, even when its name or URL matches. */
export async function saveDocumentSource(source: Source) {
  try {
    const document = await prisma.document.create({ data: source });
    return { Document: document };
  } catch (error) {
    await deleteFile(source.s3Key).catch(() => console.warn("Unreferenced source object cleanup failed"));
    throw error;
  }
}
