import { setTimeout as sleep } from "node:timers/promises";
import { readBoundedStream } from "../../utils/boundedStream";

const SUPADATA_TRANSCRIPT_URL = "https://api.supadata.ai/v1/transcript";
const SUPADATA_TIMEOUT_MS = 85_000;

type SupadataTranscriptPayload = {
  content?: Array<{ text?: unknown }> | string;
  jobId?: string;
  status?: string;
  result?: { content?: Array<{ text?: unknown }> | string };
};

export class YoutubeTranscriptProviderError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "YoutubeTranscriptProviderError";
    this.status = status;
  }
}

/**
 * Requests YouTube video transcript from Supadata third-party API provider.
 */
export async function getSupadataTranscript(videoUrl: string, callerSignal?: AbortSignal): Promise<string | null> {
  const apiKey = process.env.SUPADATA_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, ...(callerSignal ? [callerSignal] : [])]);
  const timeout = setTimeout(() => controller.abort(), SUPADATA_TIMEOUT_MS);

  try {
    const url = new URL(SUPADATA_TRANSCRIPT_URL);
    url.searchParams.set("url", videoUrl);

    const request = async (requestUrl: URL) => {
      const response = await fetch(requestUrl, {
        headers: { "x-api-key": apiKey }, signal,
      });
      console.info(`[YouTube transcript provider] Supadata: HTTP ${response.status}`);
      if (!response.ok) {
        const messages: Record<number, string> = {
          401: "The transcript provider API key is invalid or not authorized.",
          403: "The transcript provider API key is invalid or not authorized.",
          402: "The transcript provider has no remaining credits.",
          429: "The transcript provider is temporarily rate-limiting requests.",
        };
        await response.body?.cancel();
        throw new YoutubeTranscriptProviderError(response.status,
          messages[response.status] ?? "The transcript provider could not retrieve this video.");
      }
      const bytes = response.body
        ? await readBoundedStream(response.body, signal, 6 * 1024 * 1024)
        : Buffer.alloc(0);
      const payload = JSON.parse(bytes.toString("utf8")) as SupadataTranscriptPayload;
      return { payload, status: response.status };
    };
    let { payload, status } = await request(url);
    if (status === 202 || payload.jobId) {
      if (!payload.jobId) throw new YoutubeTranscriptProviderError(502, "The transcript provider returned an invalid job reference.");
      const jobUrl = new URL(`${SUPADATA_TRANSCRIPT_URL}/${encodeURIComponent(payload.jobId)}`);
      do {
        await sleep(2_000, undefined, { signal });
        ({ payload } = await request(jobUrl));
        if (payload.status === "failed") throw new YoutubeTranscriptProviderError(422, "The transcript provider could not process this video.");
        if (payload.status !== "queued" && payload.status !== "active" && payload.status !== "completed") {
          throw new YoutubeTranscriptProviderError(502, "The transcript provider returned an invalid job status.");
        }
      } while (payload.status !== "completed");
    }
    const content = payload.result?.content ?? payload.content;
    const transcript = typeof content === "string" ? content.trim() : (Array.isArray(content) ? content : [])
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
    if (signal.aborted) {
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
