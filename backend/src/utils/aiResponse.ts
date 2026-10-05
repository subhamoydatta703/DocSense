import type { GenerateContentResponse } from "@google/genai";

/** Inspect completion metadata before treating any returned text as usable. */
export function requireResponseText(response: GenerateContentResponse): string {
  const finishReason = response.candidates?.[0]?.finishReason;
  console.info("AI completion", {
    finishReason,
    promptTokens: response.usageMetadata?.promptTokenCount,
    outputTokens: response.usageMetadata?.candidatesTokenCount,
    thinkingTokens: response.usageMetadata?.thoughtsTokenCount,
  });
  if (response.promptFeedback?.blockReason) throw new Error("AI provider blocked the request.");
  if (finishReason === "MAX_TOKENS") throw new Error("AI response was truncated before completion.");
  if (finishReason && finishReason !== "STOP") throw new Error("AI provider did not complete the response.");
  const text = response.text?.trim();
  if (!text) throw new Error("AI returned an empty response.");
  return text;
}
