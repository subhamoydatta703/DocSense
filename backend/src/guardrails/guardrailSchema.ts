import { z } from "zod";

export const inputCategories = ["SAFE", "PROMPT_INJECTION", "JAILBREAK", "SYSTEM_PROMPT_EXTRACTION", "INSTRUCTION_OVERRIDE", "ROLE_MANIPULATION"] as const;
export const outputCategories = ["SAFE", "PROMPT_LEAKAGE", "CHAIN_OF_THOUGHT", "SENSITIVE_INFORMATION", "PII", "HARMFUL_CONTENT"] as const;

export function guardrailJsonSchema(categories: readonly string[]) {
  return { type: "object", properties: { safe: { type: "boolean" }, category: { type: "string", enum: [...categories] }, reason: { type: "string" } }, required: ["safe", "category", "reason"], additionalProperties: false };
}

export function parseGuardrailResponse<T extends readonly [string, ...string[]]>(text: string, categories: T) {
  const result = z.object({ safe: z.boolean(), category: z.enum(categories), reason: z.string() }).strict().parse(JSON.parse(text));
  if (result.safe !== (result.category === "SAFE")) throw new Error("Guardrail returned inconsistent classification.");
  return result;
}
