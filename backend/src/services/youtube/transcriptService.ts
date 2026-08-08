import {
    fetchTranscript,
    YoutubeTranscriptDisabledError,
    YoutubeTranscriptNotAvailableError,
    YoutubeTranscriptNotAvailableLanguageError,
} from "youtube-transcript-plus";
import type { FetchParams } from "youtube-transcript-plus";

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
const TRANSCRIPT_RETRIES = 2;

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
async function fetchYouTube(params: FetchParams, stage: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), YOUTUBE_REQUEST_TIMEOUT_MS);
    const abortFromCaller = () => controller.abort();

    params.signal?.addEventListener("abort", abortFromCaller, { once: true });

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
        return response;
    } catch (error) {
        const errorName = error instanceof Error ? error.name : "UnknownError";
        console.warn(`[YouTube transcript] ${stage}: ${errorName}`);
        throw error;
    } finally {
        clearTimeout(timeout);
        params.signal?.removeEventListener("abort", abortFromCaller);
    }
}

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

// Extract video ID from any YouTube URL format
function extractVideoId(url: string): string {
    const match = url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) throw new Error("Could not extract video ID from URL");
    return match[1]!;
}

// Identifies errors that mean the video cannot currently provide an accessible
// caption track. These must never be converted into document content.
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

export const transcriptYoutubeVideo = async (videoUrl: string) => {
    try {
        console.log("Fetching video transcript...");
        const videoId = extractVideoId(videoUrl);
        const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // 1. Metadata via oEmbed
        const oembedRes = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(sourceUrl)}&format=json`,
            {
                headers: BROWSER_HEADERS,
                signal: AbortSignal.timeout(YOUTUBE_REQUEST_TIMEOUT_MS),
            }
        );
        if (!oembedRes.ok) {
            throw new Error(`oEmbed request failed with status ${oembedRes.status}`);
        }
        const oembed = await oembedRes.json();
        const title = oembed.title || "Unknown Title";
        const channel = oembed.author_name || "Unknown Channel";

        // 2. Transcript via youtube-transcript-plus, with browser-like headers
        // and bounded retry for transient failures.
        let transcriptContent: string;
        try {
            const segments = await fetchTranscript(videoId, {
                userAgent: BROWSER_HEADERS["User-Agent"],
                retries: TRANSCRIPT_RETRIES,
                retryDelay: 1_000,
                videoFetch: (params) => fetchYouTube(params, "watch-page"),
                playerFetch: async (params) => {
                    const response = await fetchYouTube(params, "player");
                    await logPlayerResponse(response, videoId);
                    return response;
                },
                transcriptFetch: (params) => fetchYouTube(params, "transcript"),
            });
            transcriptContent = segments.map((s) => s.text).join(" ");
        } catch (transcriptErr: any) {
            if (isNoTranscriptError(transcriptErr)) {
                console.warn(
                    `[YouTube transcript] no accessible captions for ${videoId}:`,
                    transcriptErr?.message || transcriptErr,
                );
                throw new YoutubeTranscriptUnavailableError(videoId);
            }else{
                console.error(
                    `[YouTube transcript] failed for ${videoId}: ${transcriptErr?.name || "UnknownError"}`,
                    transcriptErr?.message || transcriptErr,
                );
                throw new Error(`Could not fetch transcript for video: ${transcriptErr?.message || transcriptErr}`);
            }
        }
        console.log("Video Title:", title);
        console.log("Channel:", channel);
        console.log("Video ID:", videoId);
        console.log("Transcript Content:\n", transcriptContent);

        return { transcriptContent, title, channel, videoId, sourceUrl };
    } catch (error) {
        console.error("Error fetching video transcript:", error);
        throw error;
    }
};
