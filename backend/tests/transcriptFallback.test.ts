import { expect, mock, test } from "bun:test";
import { getTranscriptWithFallback } from "../src/services/youtube/transcriptFallback";
import { YoutubeTranscriptProviderError } from "../src/services/youtube/supadataTranscriptService";

test("provider success skips public captions and an absent provider uses them", async () => {
  const fetchPublicCaptions = mock(async () => "Public transcript.");
  expect(await getTranscriptWithFallback({ fetchProviderTranscript: async () => "Provider transcript.", fetchPublicCaptions }, new AbortController().signal)).toBe("Provider transcript.");
  expect(fetchPublicCaptions).not.toHaveBeenCalled();
  expect(await getTranscriptWithFallback({ fetchProviderTranscript: async () => null, fetchPublicCaptions }, new AbortController().signal)).toBe("Public transcript.");
});

test("recoverable provider failures fall back once while authentication errors remain explicit", async () => {
  for (const status of [402, 404, 422, 429, 503, 504]) {
    const fetchPublicCaptions = mock(async () => "Public transcript.");
    expect(await getTranscriptWithFallback({
      fetchProviderTranscript: async () => { throw new YoutubeTranscriptProviderError(status, "Provider failure"); },
      fetchPublicCaptions,
    }, new AbortController().signal)).toBe("Public transcript.");
    expect(fetchPublicCaptions).toHaveBeenCalledTimes(1);
  }
  const fetchPublicCaptions = mock(async () => "Public transcript.");
  await expect(getTranscriptWithFallback({
    fetchProviderTranscript: async () => { throw new YoutubeTranscriptProviderError(401, "Invalid key"); }, fetchPublicCaptions,
  }, new AbortController().signal)).rejects.toMatchObject({ status: 401 });
  expect(fetchPublicCaptions).not.toHaveBeenCalled();
});

test("both acquisition paths failing preserves an actionable provider error and cancellation stops fallback", async () => {
  const controller = new AbortController();
  const fetchPublicCaptions = mock(async () => { throw new Error("No captions"); });
  const providers = {
    fetchProviderTranscript: async () => { throw new YoutubeTranscriptProviderError(503, "Unavailable"); }, fetchPublicCaptions,
  };
  await expect(getTranscriptWithFallback(providers, controller.signal)).rejects.toMatchObject({ status: 503 });
  controller.abort();
  fetchPublicCaptions.mockClear();
  await expect(getTranscriptWithFallback(providers, controller.signal)).rejects.toThrow();
  expect(fetchPublicCaptions).not.toHaveBeenCalled();
});

test("cancellation interrupts an unresponsive provider without starting captions", async () => {
  const controller = new AbortController();
  const fetchPublicCaptions = mock(async () => "Public transcript.");
  const result = getTranscriptWithFallback({
    fetchProviderTranscript: () => new Promise<string>(() => {}), fetchPublicCaptions,
  }, controller.signal);
  controller.abort();
  await expect(result).rejects.toThrow();
  expect(fetchPublicCaptions).not.toHaveBeenCalled();
});
