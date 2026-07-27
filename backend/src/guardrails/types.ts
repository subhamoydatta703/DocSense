export type GuardrailCategory =
    | "SAFE"
    | "PROMPT_INJECTION"
    | "JAILBREAK"
    | "SYSTEM_PROMPT_EXTRACTION"
    | "INSTRUCTION_OVERRIDE"
    | "ROLE_MANIPULATION";

export interface GuardrailResult {
    safe: boolean;
    category: GuardrailCategory;
    reason: string;
}