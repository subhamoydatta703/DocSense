import { getValidGoogleAccessToken } from "./oauthTokenService";

interface CaptionListItem {
  id?: unknown;
  snippet?: {
    language?: unknown;
    trackKind?: unknown;
  };
}

export class YoutubeCaptionPermissionError extends Error {
  readonly videoId: string;
  readonly operation: "list" | "download";

  constructor(videoId: string, operation: "list" | "download") {
    super(
      operation === "download"
        ? `The connected YouTube account cannot download captions for video ${videoId}.`
        : `The connected YouTube account cannot access captions for video ${videoId}.`,
    );
    this.name = "YoutubeCaptionPermissionError";
    this.videoId = videoId;
    this.operation = operation;
  }
}

function parseVttToText(vtt: string): string {
  return vtt
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return Boolean(trimmed) &&
        trimmed !== "WEBVTT" &&
        !trimmed.startsWith("NOTE") &&
        !/^\d+$/.test(trimmed) &&
        !/^(\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s+-->/.test(trimmed);
    })
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .filter((line, index, lines) => index === 0 || line !== lines[index - 1])
    .join(" ")
    .trim();
}

export async function getAuthorizedYouTubeTranscript(
  videoId: string,
  userId: string,
): Promise<string | null> {
  const accessToken = await getValidGoogleAccessToken(userId);
  if (!accessToken) {
    return null;
  }

  const authorization = { Authorization: `Bearer ${accessToken}` };
  const listUrl = new URL("https://www.googleapis.com/youtube/v3/captions");
  listUrl.searchParams.set("part", "snippet");
  listUrl.searchParams.set("videoId", videoId);

  const listResponse = await fetch(listUrl, { headers: authorization });
  if (listResponse.status === 401 || listResponse.status === 403) {
    throw new YoutubeCaptionPermissionError(videoId, "list");
  }
  if (!listResponse.ok) {
    throw new Error(`YouTube caption listing failed with status ${listResponse.status}`);
  }

  const listPayload = await listResponse.json() as { items?: CaptionListItem[] };
  const caption = (listPayload.items ?? []).find((item) => typeof item.id === "string");
  if (!caption || typeof caption.id !== "string") {
    throw new Error("No caption tracks are available for this authorized YouTube video");
  }

  const downloadUrl = new URL(`https://www.googleapis.com/youtube/v3/captions/${encodeURIComponent(caption.id)}`);
  downloadUrl.searchParams.set("tfmt", "vtt");
  const downloadResponse = await fetch(downloadUrl, { headers: authorization });
  if (downloadResponse.status === 401 || downloadResponse.status === 403) {
    throw new YoutubeCaptionPermissionError(videoId, "download");
  }
  if (!downloadResponse.ok) {
    throw new Error(`YouTube caption download failed with status ${downloadResponse.status}`);
  }

  const transcript = parseVttToText(await downloadResponse.text());
  if (!transcript) {
    throw new Error("YouTube returned an empty caption track");
  }

  return transcript;
}
