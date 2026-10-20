import {
    fetchTranscript,
    YoutubeTranscriptDisabledError,
    YoutubeTranscriptNotAvailableError,
    YoutubeTranscriptNotAvailableLanguageError,
} from "youtube-transcript-plus";
import type { FetchParams } from "youtube-transcript-plus";
import { redisClient } from "../../config/redis/redisCaching";
import { getSupadataTranscript } from "./supadataTranscriptService";
import { readBoundedStream } from "../../utils/boundedStream";
import { withDeadline } from "../../utils/deadline";
import { ServiceError } from "../../errors/serviceError";
import { assertReadableSource } from "../../utils/sourceText";
import { z } from "zod";
import { getTranscriptWithFallback } from "./transcriptFallback";

const TranscriptCacheSchema = z.object({
    transcriptContent: z.string().min(20).max(500_000),
    title: z.string().min(1).max(1000),
    channel: z.string().min(1).max(1000),
    videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/),
    sourceUrl: z.string(),
});

// A real browser User-Agent avoids YouTube serving a consent/cookie-wall
// page instead of the actual watch page, which is what makes the scraper
// misreport perfectly valid videos as "unavailable".
const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
};

const YOUTUBE_REQUEST_TIMEOUT_MS = 15_000;
const TRANSCRIPT_RETRIES = 1;
const TRANSCRIPT_CACHE_TTL_SECONDS = 86_400;

type PlayerResponseForLogging = {
    playabilityStatus?: {
        status?: unknown;
        reason?: unknown;
    };
    captions?: {
        playerCaptionsTracklistRenderer?: {
            captionTracks?: unknown;
        };
    };
    playerCaptionsTracklistRenderer?: {
        captionTracks?: unknown;
    };
};

// Keep the request identity consistent across the watch page, InnerTube player,
// and transcript requests. No browser session or authentication cookies are sent.
export class YoutubeTranscriptRateLimitedError extends Error {
    readonly retryAfterSeconds: number;

    constructor(retryAfterSeconds = 60) {
        super("YouTube rate-limited transcript requests from this server.");
        this.name = "YoutubeTranscriptRateLimitedError";
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

/**
 * Fetches YouTube API resources with custom browser headers and timeout handling.
 */
async function fetchYouTube(
    params: FetchParams,
    stage: string,
    videoId: string,
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), YOUTUBE_REQUEST_TIMEOUT_MS);
    const abortFromCaller = () => controller.abort();

    params.signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (params.signal?.aborted) controller.abort(params.signal.reason);

    try {
        const response = await fetch(params.url, {
            method: params.method ?? "GET",
            headers: {
                ...BROWSER_HEADERS,
                ...(params.headers ?? {}),
            },
            ...(params.body && params.method === "POST" ? { body: params.body } : {}),
            signal: controller.signal,
        });

        console.info(`[YouTube transcript] ${stage}: HTTP ${response.status}`);

        if (response.status === 429) {
            const retryAfterHeader = response.headers.get("retry-after");
            const retryAfterSeconds = retryAfterHeader && /^\d+$/.test(retryAfterHeader)
                ? Math.min(Number(retryAfterHeader), 3_600)
                : 60;

            console.warn(
                `[YouTube transcript] ${stage}: rate limited for ${videoId}; retry after ${retryAfterSeconds}s`,
            );
            throw new YoutubeTranscriptRateLimitedError(retryAfterSeconds);
        }

        // Keep the same deadline through body consumption, not just response headers.
        const bytes = response.body
            ? await readBoundedStream(response.body, controller.signal, 6 * 1024 * 1024)
            : null;
        return new Response(bytes ? Uint8Array.from(bytes) : null, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
        const errorName = error instanceof Error ? error.name : "UnknownError";
        console.warn(`[YouTube transcript] ${stage}: ${errorName}`);
        throw error;
    } finally {
        clearTimeout(timeout);
        params.signal?.removeEventListener("abort", abortFromCaller);
    }
}

/**
 * Extracts and logs YouTube player response diagnostic metadata for captions.
 */
async function logPlayerResponse(response: Response, videoId: string): Promise<void> {
    try {
        const player = await response.clone().json() as PlayerResponseForLogging;
        const tracklist =
            player.captions?.playerCaptionsTracklistRenderer ??
            player.playerCaptionsTracklistRenderer;
        const captionTracks = Array.isArray(tracklist?.captionTracks)
            ? tracklist.captionTracks
            : [];
        const status = typeof player.playabilityStatus?.status === "string"
            ? player.playabilityStatus.status
            : "unknown";
        const reason = typeof player.playabilityStatus?.reason === "string"
            ? player.playabilityStatus.reason.slice(0, 200)
            : undefined;

        console.info("[YouTube transcript] player diagnostics", {
            videoId,
            playabilityStatus: status,
            ...(reason ? { playabilityReason: reason } : {}),
            hasCaptions: Boolean(player.captions || player.playerCaptionsTracklistRenderer),
            captionTrackCount: captionTracks.length,
        });
    } catch (error) {
        console.warn(
            `[YouTube transcript] player diagnostics unavailable for ${videoId}:`,
            error instanceof Error ? error.name : "UnknownError",
        );
    }
}

/**
 * Extracts 11-character video ID from YouTube watch, shorts, or short-link URLs.
 */
function extractVideoId(url: string): string {
    const match = url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) throw new ServiceError(400, "Please provide a YouTube watch, shorts, or youtu.be video URL.");
    return match[1]!;
}

/**
 * Checks if an error indicates captions are disabled or unavailable for a video.
 */
function isNoTranscriptError(err: unknown): boolean {
    const errorName = err instanceof Error ? err.name : undefined;
    return (
        err instanceof YoutubeTranscriptDisabledError ||
        err instanceof YoutubeTranscriptNotAvailableError ||
        err instanceof YoutubeTranscriptNotAvailableLanguageError ||
        errorName === "YoutubeTranscriptDisabledError" ||
        errorName === "YoutubeTranscriptNotAvailableError" ||
        errorName === "YoutubeTranscriptNotAvailableLanguageError"
    );
}

export class YoutubeTranscriptUnavailableError extends Error {
    readonly videoId: string;

    constructor(videoId: string) {
        super(`No accessible transcript is available for YouTube video ${videoId}.`);
        this.name = "YoutubeTranscriptUnavailableError";
        this.videoId = videoId;
    }
}

async function fetchVideoMetadata(videoId: string, sourceUrl: string, acquisitionSignal: AbortSignal) {
    const fallback = { title: `YouTube video ${videoId}`, channel: "Unknown Channel" };
    try {
        const response = await fetchYouTube({
            url: `https://www.youtube.com/oembed?url=${encodeURIComponent(sourceUrl)}&format=json`,
            headers: BROWSER_HEADERS,
            signal: AbortSignal.any([acquisitionSignal, AbortSignal.timeout(3_000)]),
        }, "metadata", videoId);
        if (!response.ok) return fallback;
        const metadata = await response.json();
        return {
            title: typeof metadata.title === "string" && metadata.title.trim() ? metadata.title.trim().slice(0, 1000) : fallback.title,
            channel: typeof metadata.author_name === "string" && metadata.author_name.trim() ? metadata.author_name.trim().slice(0, 1000) : fallback.channel,
        };
    } catch (error) {
        acquisitionSignal.throwIfAborted();
        console.warn("Video metadata unavailable; using the video ID", { errorType: error instanceof Error ? error.name : "UnknownError" });
        return fallback;
    }
}

async function fetchPublicCaptions(videoId: string, acquisitionSignal: AbortSignal): Promise<string> {
    const signal = AbortSignal.any([acquisitionSignal, AbortSignal.timeout(30_000)]);
    try {
        const segments = await fetchTranscript(videoId, {
            userAgent: BROWSER_HEADERS["User-Agent"],
            retries: TRANSCRIPT_RETRIES,
            retryDelay: 1_000,
            videoFetch: params => fetchYouTube({ ...params, signal }, "watch-page", videoId),
            playerFetch: async params => {
                const response = await fetchYouTube({ ...params, signal }, "player", videoId);
                await logPlayerResponse(response, videoId);
                return response;
            },
            transcriptFetch: params => fetchYouTube({ ...params, signal }, "transcript", videoId),
        });
        return segments.map(segment => segment.text).join(" ");
    } catch (error) {
        signal.throwIfAborted();
        if (error instanceof YoutubeTranscriptRateLimitedError) throw error;
        if (isNoTranscriptError(error)) throw new YoutubeTranscriptUnavailableError(videoId);
        throw new ServiceError(502, "Could not fetch public captions for this video.");
    }
}

/** Retrieves a validated transcript with optional metadata and bounded provider fallback. */
export const transcriptYoutubeVideo = async (videoUrl: string) => {
    const acquisitionSignal = AbortSignal.timeout(70_000);
    try {
        console.log("Fetching video transcript...");
        const videoId = extractVideoId(videoUrl);
        const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const cacheKey = `youtube:transcript:${videoId}`;

        try {
            const cached = await withDeadline(redisClient.get(cacheKey), 3_000, "Transcript cache read timed out.");
            if (cached) {
                const parsed = TranscriptCacheSchema.safeParse(JSON.parse(cached));
                if (parsed.success && parsed.data.videoId === videoId && parsed.data.sourceUrl === sourceUrl) {
                    console.info(`[YouTube transcript] cache hit for ${videoId}`);
                    return parsed.data;
                }
                console.warn("Ignoring invalid transcript cache entry", { videoId });
            }
        } catch (error) {
            console.warn(
                `[YouTube transcript] cache read failed for ${videoId}:`,
                error instanceof Error ? error.name : "UnknownError",
            );
        }

        const { title, channel } = await fetchVideoMetadata(videoId, sourceUrl, acquisitionSignal);
        const transcriptContent = await getTranscriptWithFallback({
            fetchProviderTranscript: () => getSupadataTranscript(sourceUrl,
                AbortSignal.any([acquisitionSignal, AbortSignal.timeout(35_000)])),
            fetchPublicCaptions: () => fetchPublicCaptions(videoId, acquisitionSignal),
        }, acquisitionSignal);
        console.info("YouTube transcript retrieved", {
            videoId,
            characterCount: transcriptContent.length,
        });

        assertReadableSource(transcriptContent);
        const result = TranscriptCacheSchema.parse({ transcriptContent, title, channel, videoId, sourceUrl });
        try {
            await withDeadline(redisClient.setEx(
                cacheKey,
                TRANSCRIPT_CACHE_TTL_SECONDS,
                JSON.stringify(result),
            ), 3_000, "Transcript cache write timed out.");
        } catch (error) {
            console.warn(
                `[YouTube transcript] cache write failed for ${videoId}:`,
                error instanceof Error ? error.name : "UnknownError",
            );
        }

        return result;
    } catch (error) {
        console.error("Error fetching video transcript:", error);
        throw error;
    }
};
