import { YoutubeTranscriptProviderError } from "./supadataTranscriptService";
import { abortable } from "../../utils/deadline";
import { hasReadableText } from "../../utils/sourceText";

interface TranscriptProviders {
  fetchProviderTranscript: () => Promise<string | null>;
  fetchPublicCaptions: () => Promise<string>;
}

function allowsPublicCaptionFallback(error: unknown): boolean {
  if (!(error instanceof YoutubeTranscriptProviderError)) return false;
  return [402, 404, 408, 422, 429].includes(error.status) || error.status >= 500;
}

/** Authentication errors stay actionable; recoverable provider failures get one public-caption attempt. */
export async function getTranscriptWithFallback(providers: TranscriptProviders, signal: AbortSignal): Promise<string> {
  let providerError: unknown;
  signal.throwIfAborted();
  try {
    const transcript = await abortable(providers.fetchProviderTranscript(), signal);
    if (transcript !== null) {
      if (transcript.trim().length < 20 || !hasReadableText(transcript)) {
        throw new YoutubeTranscriptProviderError(404, "The transcript provider returned no usable transcript.");
      }
      return transcript;
    }
  } catch (error) {
    signal.throwIfAborted();
    if (!allowsPublicCaptionFallback(error)) throw error;
    providerError = error;
    console.warn("Transcript provider failed; trying public captions", {
      status: (error as YoutubeTranscriptProviderError).status,
    });
  }

  signal.throwIfAborted();
  try {
    return await abortable(providers.fetchPublicCaptions(), signal);
  } catch (captionError) {
    signal.throwIfAborted();
    console.warn("Public caption retrieval failed", { errorType: captionError instanceof Error ? captionError.name : "UnknownError" });
    // The configured provider's error explains why both acquisition paths failed.
    // Preserve public-caption rate limits because their retry window is useful.
    if (captionError instanceof Error && captionError.name === "YoutubeTranscriptRateLimitedError") throw captionError;
    throw providerError ?? captionError;
  }
}
