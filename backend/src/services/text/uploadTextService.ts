import { saveDocumentSource } from "../document/saveDocumentSource";

export const createFileDBText = (s3Key: string, fileName: string, originalName: string, userId: string) =>
  saveDocumentSource({ s3Key, fileName, originalName, userId, sourceType: "TEXT" });