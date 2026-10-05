import { classifyText } from "../classifyText";
import { outputCategories } from "../guardrailSchema";
import { OUTPUT_GUARDRAIL_SYSTEM_PROMPT } from "./prompts/outputGuardPrompt";
import type { OutputGuardrailResult } from "./types";

export const outputGuardrail = (assistantResponse: string, signal?: AbortSignal): Promise<OutputGuardrailResult> =>
  classifyText(assistantResponse, OUTPUT_GUARDRAIL_SYSTEM_PROMPT.replace("{{ASSISTANT_RESPONSE}}", "See the JSON user message."), outputCategories, signal);
