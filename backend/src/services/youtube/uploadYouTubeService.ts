import { saveDocumentSource } from "../document/saveDocumentSource";

export const createFileDBYoutubeUrl = (s3Key: string, fileName: string, originalName: string, url: string, userId: string) =>
  saveDocumentSource({ s3Key, fileName, originalName, sourceUrl: url, userId, sourceType: "YOUTUBE" });

export const createFileDBYoutubeTranscript = (s3Key: string, fileName: string, originalName: string, sourceUrl: string | undefined, userId: string) =>
  saveDocumentSource({ s3Key, fileName, originalName, sourceUrl, userId, sourceType: "YOUTUBE" }, false);