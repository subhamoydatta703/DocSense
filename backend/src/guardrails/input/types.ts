export type InputGuardrailCategory =
    | "SAFE"
    | "PROMPT_INJECTION"
    | "JAILBREAK"
    | "SYSTEM_PROMPT_EXTRACTION"
    | "INSTRUCTION_OVERRIDE"
    | "ROLE_MANIPULATION";

export interface InputGuardrailResult {
    safe: boolean;
    category: InputGuardrailCategory;
    reason: string;
}