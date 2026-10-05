import { classifyText } from "../classifyText";
import { inputCategories } from "../guardrailSchema";
import { INPUT_GUARDRAIL_SYSTEM_PROMPT } from "./prompts/inputGuardPrompt";
import type { InputGuardrailResult } from "./types";

export const inputGuardrail = (userQuery: string, signal?: AbortSignal): Promise<InputGuardrailResult> =>
  classifyText(userQuery, INPUT_GUARDRAIL_SYSTEM_PROMPT.replace("{{USER_INPUT}}", "See the JSON user message."), inputCategories, signal);
