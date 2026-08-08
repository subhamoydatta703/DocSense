import {
    fetchTranscript,
    YoutubeTranscriptDisabledError,
    YoutubeTranscriptNotAvailableError,
    YoutubeTranscriptNotAvailableLanguageError,
    YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript-plus";

// A real browser User-Agent avoids YouTube serving a consent/cookie-wall
// page instead of the actual watch page, which is what makes the scraper
// misreport perfectly valid videos as "unavailable".
const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
};

// Extract video ID from any YouTube URL format
function extractVideoId(url: string): string {
    const match = url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) throw new Error("Could not extract video ID from URL");
    return match[1]!;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 700): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (i < retries - 1) {
                await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
            }
        }
    }
    throw lastErr;
}

// Distinguishes "no transcript exists for this video" (fine, use fallback caption) from "network/parsing broke" (real failure, let it throw and be retried/surfaced upstream).
function isNoTranscriptError(err: unknown): boolean {
    return (
        err instanceof YoutubeTranscriptDisabledError ||
        err instanceof YoutubeTranscriptNotAvailableError ||
        err instanceof YoutubeTranscriptNotAvailableLanguageError ||
        err instanceof YoutubeTranscriptVideoUnavailableError
    );
}

function buildDefaultCaption(sourceUrl: string): string {
    const fetchedOn = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    return `No transcript available for ${sourceUrl} (checked on ${fetchedOn}).`;
}

export const transcriptYoutubeVideo = async (videoUrl: string) => {
    try {
        console.log("Fetching video transcript...");
        const videoId = extractVideoId(videoUrl);
        const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // 1. Metadata via oEmbed
        const oembedRes = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(sourceUrl)}&format=json`,
            { headers: BROWSER_HEADERS }
        );
        if (!oembedRes.ok) {
            throw new Error(`oEmbed request failed with status ${oembedRes.status}`);
        }
        const oembed = await oembedRes.json();
        const title = oembed.title || "Unknown Title";
        const channel = oembed.author_name || "Unknown Channel";

        // 2. Transcript via youtube-transcript-plus, with browser-like headers and retry for transient failures. Falls back to a default caption if the video genuinely has no transcript.
        let transcriptContent: string;
        try {
            const segments = await withRetry(() =>
                fetchTranscript(videoId, {
                    // lang: "en",
                    videoFetch: async ({ url }) => fetch(url, { headers: BROWSER_HEADERS }),
                })
            );
            transcriptContent = segments.map((s) => s.text).join(" ");
        } catch (transcriptErr: any) {
            console.error(`Failed to fetch transcript for ${sourceUrl}:`, transcriptErr);
            throw new Error(`Could not fetch transcript for video: ${transcriptErr.message || transcriptErr}`);
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