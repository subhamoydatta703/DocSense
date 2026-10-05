import { createPartFromUri, createUserContent, type File as GeminiFile } from "@google/genai";
import { setTimeout as sleep } from "node:timers/promises";
import { ai } from "../../config/ai/ai";

const TRANSCRIPTION_MODEL = process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-3.6-flash";

/**
 * Uploads media file to Gemini Files API and requests speech-to-text transcript generation.
 */
export async function transcribeUploadedMedia(
  buffer: Buffer,
  mimeType: string,
  displayName: string,
): Promise<string> {
  let uploadedFile: GeminiFile | undefined;
  const signal = AbortSignal.timeout(150_000);

  try {
    uploadedFile = await ai.files.upload({
      file: new Blob([
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
      ], { type: mimeType }),
      config: {
        displayName,
        mimeType,
        abortSignal: signal,
      },
    });

    if (!uploadedFile.name) throw new Error("Gemini did not return a file name.");
    while (uploadedFile.state !== "ACTIVE") {
      if (uploadedFile.state === "FAILED") throw new Error("Gemini could not process this media file.");
      await sleep(2_000, undefined, { signal });
      uploadedFile = await ai.files.get({ name: uploadedFile.name!, config: { abortSignal: signal } });
    }
    if (!uploadedFile.uri || !uploadedFile.mimeType) {
      throw new Error("Gemini did not return a usable uploaded media reference.");
    }

    const response = await ai.models.generateContent({
      model: TRANSCRIPTION_MODEL,
      config: { abortSignal: signal },
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
        "Generate an accurate plain-text transcript of all spoken content in this media. Do not summarize, omit, or invent speech. Return only the transcript text.",
      ]),
    });

    const transcript = response.text?.trim();
    if (!transcript) {
      throw new Error("Gemini returned an empty transcript.");
    }
    return transcript;
  } finally {
    if (uploadedFile?.name) {
      try {
        await ai.files.delete({ name: uploadedFile.name, config: { abortSignal: AbortSignal.timeout(10_000) } });
      } catch (error) {
        console.warn(
          "Failed to delete temporary Gemini media file:",
          error instanceof Error ? error.name : "UnknownError",
        );
      }
    }
  }
}
