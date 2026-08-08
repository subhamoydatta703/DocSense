import { createPartFromUri, createUserContent } from "@google/genai";
import { ai } from "../../config/ai/ai";

const TRANSCRIPTION_MODEL = process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-3.6-flash";

export async function transcribeUploadedMedia(
  buffer: Buffer,
  mimeType: string,
  displayName: string,
): Promise<string> {
  let uploadedFile: { name?: string; uri?: string; mimeType?: string } | undefined;

  try {
    uploadedFile = await ai.files.upload({
      file: new Blob([
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
      ], { type: mimeType }),
      config: {
        displayName,
        mimeType,
      },
    });

    if (!uploadedFile.uri || !uploadedFile.mimeType) {
      throw new Error("Gemini did not return a usable uploaded media reference.");
    }

    const response = await ai.models.generateContent({
      model: TRANSCRIPTION_MODEL,
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
        await ai.files.delete({ name: uploadedFile.name });
      } catch (error) {
        console.warn(
          "Failed to delete temporary Gemini media file:",
          error instanceof Error ? error.name : "UnknownError",
        );
      }
    }
  }
}
