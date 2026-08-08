const SUPADATA_TRANSCRIPT_URL = "https://api.supadata.ai/v1/transcript";
const SUPADATA_TIMEOUT_MS = 45_000;

type SupadataTranscriptPayload = {
  content?: Array<{ text?: unknown }>;
};

export class YoutubeTranscriptProviderError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "YoutubeTranscriptProviderError";
    this.status = status;
  }
}

export async function getSupadataTranscript(videoUrl: string): Promise<string | null> {
  const apiKey = process.env.SUPADATA_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPADATA_TIMEOUT_MS);

  try {
    const url = new URL(SUPADATA_TRANSCRIPT_URL);
    url.searchParams.set("url", videoUrl);

    const response = await fetch(url, {
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
    });

    console.info(`[YouTube transcript provider] Supadata: HTTP ${response.status}`);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new YoutubeTranscriptProviderError(
          response.status,
          "The transcript provider API key is invalid or not authorized.",
        );
      }
      if (response.status === 402) {
        throw new YoutubeTranscriptProviderError(
          response.status,
          "The transcript provider has no remaining credits.",
        );
      }
      if (response.status === 429) {
        throw new YoutubeTranscriptProviderError(
          response.status,
          "The transcript provider is temporarily rate-limiting requests.",
        );
      }
      throw new YoutubeTranscriptProviderError(
        response.status,
        "The transcript provider could not retrieve this video.",
      );
    }

    const payload = await response.json() as SupadataTranscriptPayload;
    const transcript = (payload.content ?? [])
      .map((segment) => typeof segment.text === "string" ? segment.text.trim() : "")
      .filter(Boolean)
      .join(" ")
      .trim();

    if (!transcript) {
      throw new YoutubeTranscriptProviderError(
        404,
        "The transcript provider returned no transcript for this video.",
      );
    }

    return transcript;
  } catch (error) {
    if (error instanceof YoutubeTranscriptProviderError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new YoutubeTranscriptProviderError(
        504,
        "The transcript provider timed out while processing this video.",
      );
    }
    throw new YoutubeTranscriptProviderError(
      502,
      "The transcript provider could not be reached.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
