import { saveDocumentSource } from "../document/saveDocumentSource";

export const createFileDBWebUrl = (s3Key: string, originalName: string, url: string, userId: string) =>
  saveDocumentSource({ s3Key, originalName, fileName: originalName, sourceUrl: url, userId, sourceType: "WEBSITE" });